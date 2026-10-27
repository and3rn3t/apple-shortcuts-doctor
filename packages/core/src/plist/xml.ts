import { createDictionary, DecodeBudget } from './budget.ts';
import type { PlistDictionary, PlistValue } from './budget.ts';

const ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};
const OPEN_TAG = /<([A-Za-z]+)(?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*\s*(\/?)>/y;
const ENTITY = /&(?:#x([0-9A-Fa-f]{1,6})|#([0-9]{1,7})|([a-z]+));/g;
const INTEGER = /^[+-]?(?:\d+|0x[0-9A-Fa-f]+)$/;
const REAL_SPECIALS: Readonly<Record<string, number>> = {
  nan: Number.NaN,
  inf: Infinity,
  '+inf': Infinity,
  '-inf': -Infinity,
  infinity: Infinity,
  '+infinity': Infinity,
  '-infinity': -Infinity,
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

interface Tag {
  name: string;
  selfClosing: boolean;
}

function fail(): never {
  throw new Error('Malformed XML plist.');
}

function decodeEntity(_match: string, hex?: string, decimal?: string, named?: string): string {
  if (named !== undefined) return ENTITIES[named] ?? fail();
  const codePoint = Number.parseInt((hex ?? decimal) as string, hex === undefined ? 10 : 16);
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) fail();
  return String.fromCodePoint(codePoint);
}

function decodeEntities(raw: string): string {
  const decoded = raw.replace(ENTITY, decodeEntity);
  if (raw.replace(ENTITY, '').includes('&')) fail();
  return decoded;
}

function toInteger(text: string): number {
  const trimmed = text.trim();
  if (!INTEGER.test(trimmed)) fail();
  const negative = trimmed.startsWith('-');
  const digits = trimmed.replace(/^[+-]/, '');
  const magnitude = Number(digits);
  return negative ? -magnitude : magnitude;
}

function toReal(text: string): number {
  const trimmed = text.trim();
  const special = REAL_SPECIALS[trimmed.toLowerCase()];
  if (special !== undefined) return special;
  const value = Number(trimmed);
  if (trimmed === '' || Number.isNaN(value)) fail();
  return value;
}

function toDate(text: string): Date {
  const trimmed = text.trim();
  const date = new Date(trimmed);
  if (!ISO_DATE.test(trimmed) || Number.isNaN(date.getTime())) fail();
  return date;
}

function toData(text: string): Uint8Array {
  const compact = text.replace(/\s+/g, '');
  if (!BASE64.test(compact)) fail();
  try {
    return Uint8Array.from(atob(compact), character => character.charCodeAt(0));
  } catch {
    return fail();
  }
}

/** Recursive-descent reader over the plist XML subset Apple writes. No DTDs, no external entities. */
class XmlPlistReader {
  private position = 0;
  private readonly text: string;
  private readonly budget: DecodeBudget;

  constructor(text: string, budget: DecodeBudget) {
    this.text = text;
    this.budget = budget;
  }

  read(): PlistValue {
    this.skipProlog();
    const root = this.readOpenTag();
    if (root.name !== 'plist' || root.selfClosing) fail();
    const value = this.readValue(1);
    this.skipMisc();
    this.expectClose('plist');
    this.skipMisc();
    if (this.position !== this.text.length) fail();
    return value;
  }

  private startsWith(prefix: string): boolean {
    return this.text.startsWith(prefix, this.position);
  }

  private skipPast(terminator: string): string {
    const end = this.text.indexOf(terminator, this.position);
    if (end < 0) fail();
    const skipped = this.text.slice(this.position, end);
    this.position = end + terminator.length;
    return skipped;
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.text.charAt(this.position))) this.position++;
  }

  /** Whitespace and comments, which may appear between any two elements. */
  private skipMisc(): void {
    for (;;) {
      this.skipWhitespace();
      if (!this.startsWith('<!--')) return;
      this.skipPast('-->');
    }
  }

  private skipProlog(): void {
    for (;;) {
      this.skipMisc();
      if (this.startsWith('<?')) this.skipPast('?>');
      else if (this.startsWith('<!DOCTYPE')) {
        // An internal subset ("[") could declare entities; refuse it outright.
        if (this.skipPast('>').includes('[')) fail();
      } else return;
    }
  }

  private readOpenTag(): Tag {
    OPEN_TAG.lastIndex = this.position;
    const match = OPEN_TAG.exec(this.text);
    if (!match) fail();
    this.position = OPEN_TAG.lastIndex;
    return { name: match[1] as string, selfClosing: match[2] === '/' };
  }

  private expectClose(name: string): void {
    const close = new RegExp(`</${name}\\s*>`, 'y');
    close.lastIndex = this.position;
    if (!close.test(this.text)) fail();
    this.position = close.lastIndex;
  }

  /** Character data up to the next tag, with entities and CDATA sections decoded. */
  private readText(): string {
    let text = '';
    for (;;) {
      const next = this.text.indexOf('<', this.position);
      if (next < 0) fail();
      text += decodeEntities(this.text.slice(this.position, next));
      this.position = next;
      if (!this.startsWith('<![CDATA[')) return text;
      this.position += '<![CDATA['.length;
      text += this.skipPast(']]>');
    }
  }

  private readElementText(tag: Tag): string {
    if (tag.selfClosing) return '';
    const text = this.readText();
    this.expectClose(tag.name);
    return text;
  }

  private readValue(depth: number): PlistValue {
    this.budget.enter(depth);
    this.skipMisc();
    const tag = this.readOpenTag();
    switch (tag.name) {
      case 'dict':
        return tag.selfClosing ? createDictionary() : this.readDictionary(depth);
      case 'array':
        return tag.selfClosing ? [] : this.readArray(depth);
      case 'string':
        return this.readElementText(tag);
      case 'true':
      case 'false':
        if (this.readElementText(tag) !== '') fail();
        return tag.name === 'true';
      case 'integer':
        return toInteger(this.readElementText(tag));
      case 'real':
        return toReal(this.readElementText(tag));
      case 'date':
        return toDate(this.readElementText(tag));
      case 'data':
        return toData(this.readElementText(tag));
      default:
        return fail();
    }
  }

  private atClosingTag(): boolean {
    this.skipMisc();
    return this.startsWith('</');
  }

  private readArray(depth: number): PlistValue[] {
    const items: PlistValue[] = [];
    while (!this.atClosingTag()) items.push(this.readValue(depth + 1));
    this.expectClose('array');
    return items;
  }

  private readDictionary(depth: number): PlistDictionary {
    const dictionary = createDictionary();
    while (!this.atClosingTag()) {
      const keyTag = this.readOpenTag();
      if (keyTag.name !== 'key') fail();
      const key = this.readElementText(keyTag);
      dictionary[key] = this.readValue(depth + 1);
    }
    this.expectClose('dict');
    return dictionary;
  }
}

/** Decodes an XML property list. Throws a content-free error on anything malformed. */
export function parseXmlPlist(bytes: Uint8Array, budget = new DecodeBudget()): PlistValue {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail();
  }
  // TextDecoder already drops a leading byte-order mark.
  return new XmlPlistReader(text, budget).read();
}
