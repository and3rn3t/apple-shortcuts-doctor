import { describe, expect, it } from 'vitest';
import { parseExport } from '../src/index.ts';
import { parseBinaryPlist } from '../src/plist/binary.ts';
import { decodePlist, MAX_DEPTH } from '../src/plist/index.ts';
import { parseXmlPlist } from '../src/plist/xml.ts';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const xml = (body: string): Uint8Array =>
  utf8(`<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">${body}</plist>`);
const ascii = (text: string): number[] => [0x50 | text.length, ...utf8(text)];

/** Assembles a bplist00 from raw object encodings, with 1-byte offsets and refs unless overridden. */
function bplist(objects: number[][], top = 0, { offsetSize = 1, refSize = 1 } = {}): Uint8Array {
  const header = [...utf8('bplist00')];
  const offsets: number[] = [];
  const body: number[] = [];
  for (const object of objects) {
    offsets.push(header.length + body.length);
    body.push(...object);
  }
  const tableOffset = header.length + body.length;
  const table = offsets.flatMap(offset => bigEndian(offset, offsetSize));
  const trailer = [
    ...[0, 0, 0, 0, 0, 0, offsetSize, refSize],
    ...bigEndian(objects.length, 8),
    ...bigEndian(top, 8),
    ...bigEndian(tableOffset, 8),
  ];
  return Uint8Array.from([...header, ...body, ...table, ...trailer]);
}

function bigEndian(value: number, size: number): number[] {
  return Array.from({ length: size }, (_, index) => (value / 256 ** (size - 1 - index)) & 0xff);
}

const DECODE_ERROR =
  'Cannot decode plist. It may be malformed, nested too deeply, or use unsupported plist values.';

describe('XML plist decoding', () => {
  it('decodes every supported value type', () => {
    const value = parseXmlPlist(
      xml(`<dict>
        <key>s</key><string>a &lt;b&gt; &amp; &#x263A; &#65;</string>
        <key>empty</key><string/>
        <key>i</key><integer>-42</integer>
        <key>hex</key><integer>0x1F</integer>
        <key>r</key><real>1.5</real>
        <key>inf</key><real>-infinity</real>
        <key>t</key><true/>
        <key>f</key><false></false>
        <key>d</key><date>2001-01-01T00:00:00Z</date>
        <key>data</key><data>
          AAEC
        </data>
        <key>a</key><array><integer>1</integer><dict/><array/></array>
      </dict>`)
    );
    expect(value).toEqual({
      s: 'a <b> & ☺ A',
      empty: '',
      i: -42,
      hex: 31,
      r: 1.5,
      inf: -Infinity,
      t: true,
      f: false,
      d: new Date(Date.UTC(2001, 0, 1)),
      data: Uint8Array.from([0, 1, 2]),
      a: [1, {}, []],
    });
  });

  it('accepts comments, a DOCTYPE without an internal subset, and CDATA', () => {
    const value = decodePlist(
      utf8(
        '<?xml version="1.0"?><!-- c --><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ' +
          '"http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist><!-- c --><array>' +
          '<!-- c --><string>x<![CDATA[<&>]]>y</string></array></plist>\n'
      )
    );
    expect(value).toEqual(['x<&>y']);
  });

  it('keeps __proto__ keys as data without touching prototypes', () => {
    const value = parseXmlPlist(
      xml('<dict><key>__proto__</key><dict><key>x</key><true/></dict></dict>')
    );
    expect(Object.getPrototypeOf(value)).toBeNull();
    expect(Object.keys(value as object)).toEqual(['__proto__']);
    expect(({} as { x?: unknown }).x).toBeUndefined();
  });

  it.each([
    [
      'an internal DTD subset',
      '<!DOCTYPE plist [<!ENTITY x "y">]><plist><string>&x;</string></plist>',
    ],
    ['an unknown entity', '<plist><string>&x;</string></plist>'],
    ['a bare ampersand', '<plist><string>a & b</string></plist>'],
    ['a surrogate character reference', '<plist><string>&#xD800;</string></plist>'],
    ['a missing root', '<array/>'],
    ['an empty root', '<plist/>'],
    ['trailing content', '<plist><true/></plist><plist/>'],
    ['an unclosed element', '<plist><array><true/></plist>'],
    ['a value outside a key', '<plist><dict><string>x</string></dict></plist>'],
    ['a key without a value', '<plist><dict><key>k</key></dict></plist>'],
    ['an unknown element', '<plist><set/></plist>'],
    ['text inside true', '<plist><true>x</true></plist>'],
    ['a bad integer', '<plist><integer>1.5</integer></plist>'],
    ['a bad real', '<plist><real>abc</real></plist>'],
    ['an empty real', '<plist><real></real></plist>'],
    ['a bad date', '<plist><date>yesterday</date></plist>'],
    ['bad base64', '<plist><data>***</data></plist>'],
    ['misplaced base64 padding', '<plist><data>A=AA</data></plist>'],
    ['an unterminated comment', '<plist><!-- never'],
    ['an unterminated CDATA', '<plist><string><![CDATA[x</string></plist>'],
    ['text with no closing tag', '<plist><string>x'],
  ])('rejects %s', (_label, text) => {
    expect(() => parseXmlPlist(utf8(text))).toThrow('Malformed XML plist.');
  });

  it('rejects invalid UTF-8', () => {
    expect(() => parseXmlPlist(Uint8Array.from([...utf8('<plist><string>'), 0xff]))).toThrow(
      'Malformed XML plist.'
    );
  });

  it('limits nesting depth', () => {
    const nested = (depth: number): string => '<array>'.repeat(depth) + '</array>'.repeat(depth);
    expect(() => parseXmlPlist(xml(nested(MAX_DEPTH - 1)))).not.toThrow();
    expect(() => parseXmlPlist(xml(nested(MAX_DEPTH + 1)))).toThrow('nesting');
  });
});

describe('binary plist decoding', () => {
  it('decodes every supported value type', () => {
    const keys = ['i1', 'i2', 'i4', 'i8', 'f4', 'f8', 'd', 'data', 'u', 'long', 't', 'f', 'a'];
    const longText = 'x'.repeat(20);
    const values: number[][] = [
      [0x10, 0xff],
      [0x11, 0x01, 0x00],
      [0x12, 0x00, 0x01, 0x00, 0x00],
      [0x13, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe],
      [0x22, 0x3f, 0xc0, 0x00, 0x00],
      [0x23, 0x40, 0x04, 0, 0, 0, 0, 0, 0],
      [0x33, 0x40, 0x4e, 0, 0, 0, 0, 0, 0],
      [0x42, 0x01, 0x02],
      [0x62, 0x26, 0x3a, 0x00, 0x41],
      [0x5f, 0x10, longText.length, ...utf8(longText)],
      [0x09],
      [0x08],
      [0xa0],
    ];
    const count = keys.length;
    const dictionary = [
      0xd0 | 0xf,
      0x10,
      count,
      ...keys.map((_, i) => 1 + i),
      ...keys.map((_, i) => 1 + count + i),
    ];
    const value = parseBinaryPlist(bplist([dictionary, ...keys.map(ascii), ...values]));
    expect(value).toEqual({
      i1: 255,
      i2: 256,
      i4: 65536,
      i8: -2,
      f4: 1.5,
      f8: 2.5,
      d: new Date(Date.UTC(2001, 0, 1) + 60_000),
      data: Uint8Array.from([1, 2]),
      u: '☺A',
      long: longText,
      t: true,
      f: false,
      a: [],
    });
  });

  it('decodes wide offsets and references', () => {
    const value = parseBinaryPlist(
      bplist([[0xa1, 0x00, 0x01], ascii('ok')], 0, { offsetSize: 2, refSize: 2 })
    );
    expect(value).toEqual(['ok']);
  });

  it('allows shared references and keeps __proto__ as data', () => {
    const value = parseBinaryPlist(
      bplist([[0xd2, 1, 2, 3, 3], ascii('__proto__'), ascii('b'), [0xa0]])
    );
    expect(Object.getPrototypeOf(value)).toBeNull();
    expect(value).toEqual(Object.assign(Object.create(null), { ['__proto__']: [], b: [] }));
  });

  it('rejects reference cycles', () => {
    expect(() => parseBinaryPlist(bplist([[0xa1, 0]]))).toThrow('Malformed binary plist.');
  });

  it('bounds exponential expansion of shared references', () => {
    // Each array holds two references to the next: 2^40 values if fully expanded.
    const levels = 40;
    const objects = Array.from({ length: levels }, (_, index) =>
      index === levels - 1 ? [0xa0] : [0xa2, index + 1, index + 1]
    );
    expect(() => parseBinaryPlist(bplist(objects))).toThrow('too many values');
  });

  it('limits nesting depth', () => {
    const chain = (depth: number): number[][] =>
      Array.from({ length: depth }, (_, index) =>
        index === depth - 1 ? [0xa0] : [0xa1, index + 1]
      );
    expect(() => parseBinaryPlist(bplist(chain(MAX_DEPTH)))).not.toThrow();
    expect(() => parseBinaryPlist(bplist(chain(MAX_DEPTH + 1)))).toThrow('nesting');
  });

  const valid = bplist([[0xa1, 1], ascii('ok')]);
  const withTrailer = (patch: (bytes: Uint8Array) => void): Uint8Array => {
    const copy = valid.slice();
    patch(copy);
    return copy;
  };
  const trailerStart = valid.length - 32;

  it.each([
    ['a truncated file', utf8('bplist00')],
    ['an offset size of 0', withTrailer(b => (b[trailerStart + 6] = 0))],
    ['a reference size of 9', withTrailer(b => (b[trailerStart + 7] = 9))],
    ['a top object past the end', withTrailer(b => (b[trailerStart + 23] = 9))],
    ['an offset table past the trailer', withTrailer(b => (b[trailerStart + 31] = 0xf0))],
    ['an offset into the header', withTrailer(b => (b[valid.length - 34] = 2))],
    ['an oversized 64-bit count', withTrailer(b => (b[trailerStart + 8] = 0xff))],
    ['a reference past the object count', bplist([[0xa1, 7]])],
    ['a non-string dictionary key', bplist([[0xd1, 1, 1], [0x09]])],
    ['a UID', bplist([[0x80, 0x01]])],
    ['a null marker', bplist([[0x00]])],
    ['a 16-byte integer', bplist([[0x14, ...new Array<number>(16).fill(0)]])],
    ['an integer beyond 2^53', bplist([[0x13, 0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]])],
    ['a 2-byte real', bplist([[0x21, 0x00, 0x00]])],
    ['a malformed date marker', bplist([[0x32, 0, 0, 0, 0]])],
    ['non-ASCII in an ASCII string', bplist([[0x51, 0xe9]])],
    ['a string past the object area', bplist([[0x5f, 0x10, 0x7f, 0x41]])],
    ['a count with a non-integer marker', bplist([[0x5f, 0x20, 0x01]])],
    ['a count with a 16-byte integer', bplist([[0x5f, 0x14, 0x01]])],
    ['an integer past the object area', bplist([[0x13, 0x00]])],
  ])('rejects %s', (_label, bytes) => {
    expect(() => parseBinaryPlist(bytes)).toThrow(/binary plist|too many values|nesting/);
  });
});

/** Small deterministic PRNG so mutation tests are reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('hostile plist input through parseExport', () => {
  const seeds = {
    xml: xml(
      '<dict><key>WFWorkflowActions</key><array><dict><key>k</key><string>secret-value</string></dict></array></dict>'
    ),
    binary: bplist([
      [0xd1, 1, 2],
      ascii('WFWorkflowActions'),
      [0xa1, 3],
      [0xd1, 4, 5],
      ascii('k'),
      ascii('secret-value'),
    ]),
  };

  it.each(Object.entries(seeds))(
    'fails closed on every truncation of the %s seed',
    (_kind, seed) => {
      for (let length = 0; length < seed.length; length++) {
        const outcome = tryParse(seed.subarray(0, length));
        expect(outcome).not.toContain('secret-value');
      }
    }
  );

  it.each(Object.entries(seeds))(
    'fails closed on random byte mutations of the %s seed',
    (_kind, seed) => {
      const random = mulberry32(seed.length);
      for (let iteration = 0; iteration < 2000; iteration++) {
        const mutated = seed.slice();
        const flips = 1 + Math.floor(random() * 4);
        for (let flip = 0; flip < flips; flip++) {
          mutated[Math.floor(random() * mutated.length)] = Math.floor(random() * 256);
        }
        expect(tryParse(mutated)).not.toContain('secret-value');
      }
    }
  );
});

/** Returns 'ok' or the error message; any error must be one of the fixed messages. */
function tryParse(bytes: Uint8Array): string {
  try {
    parseExport(bytes);
    return 'ok';
  } catch (error) {
    const message = (error as Error).message;
    expect([
      DECODE_ERROR,
      'Invalid JSON export. Supply a complete workflow dictionary.',
      'Unsupported export. Signed containers are not decoded; supply unsigned plist or JSON.',
    ]).toContain(message);
    return message;
  }
}
