import { describe, expect, it } from 'vitest';
import { inspectWorkflow, renderMarkdown, renderText, toReportV1 } from '../src/index.ts';
import { action, workflow } from './helpers.ts';

// Secret-shaped fixtures are assembled at run time, so no scanner finds a token in the repository.
const join = (...parts: string[]): string => parts.join('');
const alnum = (length: number, seed = 7): string => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let state = seed;
  let out = '';
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out += alphabet[state % alphabet.length];
  }
  return out;
};
const FIXTURES = {
  aws: join('AK', 'IA', 'ABCD1234EFGH5678'),
  github: join('gh', 'p_', alnum(36)),
  githubFine: join('github', '_pat_', alnum(40)),
  slack: join('xo', 'xb-', '123456789012-', alnum(24)),
  stripe: join('sk', '_live_', alnum(24)),
  anthropic: join('sk', '-ant-', alnum(40)),
  google: join('AI', 'za', alnum(35)),
  jwt: join('ey', 'J', alnum(20), '.ey', 'J', alnum(20), '.', alnum(20)),
  privateKey: join('-----BEGIN ', 'RSA PRIVATE', ' KEY-----'),
  bearer: join('Bearer ', alnum(40)),
  passwordUrl: join('https://admin:', 'hunter2pass', '@host.example.invalid/x'),
  highEntropy: alnum(48, 99),
  hexKey: join('9f8e7d6c5b4a3928', '1706f5e4d3c2b1a0').repeat(2),
};

const text = (value: string): unknown => ({
  Value: { string: value, attachmentsByRange: {} },
  WFSerializationType: 'WFTextTokenString',
});
const pair = (key: string, value: string): unknown => ({
  WFItemType: 0,
  WFKey: text(key),
  WFValue: text(value),
});
const dictionary = (...items: unknown[]): unknown => ({
  Value: { WFDictionaryFieldValueItems: items },
  WFSerializationType: 'WFDictionaryFieldValue',
});
const found = (...actions: unknown[]): { ruleId: string; actions: number[]; severity: string }[] =>
  inspectWorkflow(workflow(...actions)).findings.filter(f => f.code === 'hardcoded-secret');

describe('hardcoded secret detection', () => {
  it.each(
    Object.entries({
      aws: FIXTURES.aws,
      github: FIXTURES.github,
      githubFine: FIXTURES.githubFine,
      slack: FIXTURES.slack,
      stripe: FIXTURES.stripe,
      anthropic: FIXTURES.anthropic,
      google: FIXTURES.google,
      jwt: FIXTURES.jwt,
      privateKey: FIXTURES.privateKey,
      bearer: FIXTURES.bearer,
      passwordUrl: FIXTURES.passwordUrl,
    })
  )('recognizes a %s token format as a warning, anywhere in the parameters', (_name, secret) => {
    const [finding] = found(
      action('gettext', { Nested: [{ Deep: text(`prefix ${secret} suffix`) }] })
    );
    expect(finding).toMatchObject({
      ruleId: 'secret-token-format',
      actions: [1],
      severity: 'warning',
    });
  });

  it('recognizes a plain string parameter, not only rich text', () => {
    expect(found(action('gettext', { WFTextActionText: FIXTURES.github }))).toHaveLength(1);
  });

  it.each([
    ['Authorization', FIXTURES.bearer],
    ['api_key', alnum(24, 3)],
    ['X-Api-Key', alnum(20, 4)],
    ['password', 'Passw0rd!x'],
    ['client_secret', alnum(30, 5)],
    ['Token', alnum(16, 6)],
  ])('flags a literal value for the field named %s', (key, value) => {
    const [finding] = found(action('downloadurl', { WFHTTPHeaders: dictionary(pair(key, value)) }));
    expect(finding).toMatchObject({
      ruleId: 'secret-named-field',
      severity: 'warning',
      actions: [1],
    });
  });

  it('does not flag a named field whose value comes from a variable or is short or a plain word', () => {
    const variable = {
      Value: {
        string: '￼',
        attachmentsByRange: { '{0, 1}': { Type: 'Variable', VariableName: 'k' } },
      },
      WFSerializationType: 'WFTextTokenString',
    };
    expect(
      found(
        action('downloadurl', {
          WFHTTPHeaders: dictionary(
            { WFItemType: 0, WFKey: text('Authorization'), WFValue: variable },
            pair('password', 'short'),
            pair('token', 'nextpageword'),
            pair('api_key', '')
          ),
        })
      )
    ).toEqual([]);
  });

  it('does not flag a field with an ordinary name, even for a long random-looking value', () => {
    expect(
      found(
        action('downloadurl', { WFHTTPHeaders: dictionary(pair('Accept', 'application/json')) })
      )
    ).toEqual([]);
  });

  it('flags a long high-entropy string as a weaker review finding', () => {
    for (const secret of [FIXTURES.highEntropy, FIXTURES.hexKey]) {
      expect(found(action('gettext', { Text: text(`  ${secret}\n`) }))).toEqual([
        {
          code: 'hardcoded-secret',
          ruleId: 'secret-high-entropy',
          severity: 'review',
          actions: [1],
          message: expect.any(String),
        },
      ]);
    }
  });

  it('flags a random token only when it is the whole value, not a run inside other text', () => {
    const inside = [
      `https://example.invalid/items/${FIXTURES.highEntropy}/details`,
      `id=${FIXTURES.highEntropy}`,
      `note: ${FIXTURES.hexKey} was the build`,
      `${FIXTURES.highEntropy}+${FIXTURES.highEntropy}/${FIXTURES.highEntropy}==`,
    ];
    expect(found(...inside.map(value => action('gettext', { Text: text(value) })))).toEqual([]);
  });

  it('does not treat a variable inside a credential-looking URL as a literal password', () => {
    const withVariable = {
      Value: {
        string: 'https://user:\uFFFC\uFFFC\uFFFC@host.example.invalid/x',
        attachmentsByRange: {
          '{14, 1}': { Type: 'Variable', VariableName: 'a' },
          '{15, 1}': { Type: 'Variable', VariableName: 'b' },
          '{16, 1}': { Type: 'Variable', VariableName: 'c' },
        },
      },
      WFSerializationType: 'WFTextTokenString',
    };
    expect(found(action('downloadurl', { WFURL: withVariable }))).toEqual([]);
  });

  it('reports a recognized token format instead of also calling the action merely random', () => {
    const findings = found(
      action('gettext', { A: text(FIXTURES.github), B: text(FIXTURES.highEntropy) })
    );
    expect(findings.map(f => f.ruleId)).toEqual(['secret-token-format']);
  });

  it('flags a named field only for a value that is not an ordinary lowercase word', () => {
    const findings = found(
      action('downloadurl', { WFHTTPHeaders: dictionary(pair('token', 'nextpageword')) })
    );
    expect(findings).toEqual([]);
    expect(
      found(action('downloadurl', { WFHTTPHeaders: dictionary(pair('token', 'nextpage2')) }))
    ).toHaveLength(1);
  });

  it('leaves ordinary strings alone', () => {
    const ordinary = [
      'Hello, world! This is a perfectly normal sentence of text.',
      'https://example.invalid/some/long/path/segment/that/is/readable',
      '123e4567-e89b-12d3-a456-426614174000',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz',
      '1234567890123456789012345678901234567890',
      alnum(8),
      'user1user2user3user4user5user6',
      '01234567-89ab-cdef-0123-456789abcdef',
      `data:image/png;base64,${alnum(5000)}`,
    ];
    expect(found(...ordinary.map(value => action('gettext', { Text: text(value) })))).toEqual([]);
  });

  it('skips structural keys such as UUIDs and group identifiers', () => {
    expect(
      found(
        action('gettext', {
          UUID: FIXTURES.highEntropy,
          GroupingIdentifier: FIXTURES.highEntropy,
          OutputUUID: FIXTURES.highEntropy,
        })
      )
    ).toEqual([]);
  });

  it('reports each action once per kind and groups actions of the same kind', () => {
    const findings = found(
      action('gettext', { A: text(FIXTURES.github), B: text(FIXTURES.aws) }),
      action('gettext'),
      action('gettext', { A: text(FIXTURES.stripe) })
    );
    expect(findings).toEqual([
      expect.objectContaining({ ruleId: 'secret-token-format', actions: [1, 3] }),
    ]);
  });

  it('never puts the secret, a prefix of it, or its length into any output', () => {
    const secrets = Object.values(FIXTURES);
    const report = inspectWorkflow(
      workflow(
        ...secrets.map(secret =>
          action('downloadurl', {
            WFURL: secret,
            Text: text(secret),
            WFHTTPHeaders: dictionary(pair('Authorization', secret)),
          })
        )
      )
    );
    const outputs = [
      JSON.stringify(report),
      renderText(report),
      renderMarkdown(report),
      JSON.stringify(toReportV1(report)),
    ];
    for (const output of outputs) {
      for (const secret of secrets) {
        expect(output).not.toContain(secret);
        expect(output).not.toContain(secret.slice(0, 8));
      }
    }
    const message = report.findings.find(f => f.code === 'hardcoded-secret')?.message ?? '';
    expect(message).not.toMatch(/\d/);
  });

  it('never puts the secret into an error, even for a malformed workflow', () => {
    const bad = {
      WFWorkflowActions: [
        {
          WFWorkflowActionIdentifier: FIXTURES.github,
          WFWorkflowActionParameters: { x: FIXTURES.aws },
        },
      ],
    };
    let message = '';
    try {
      inspectWorkflow(bad);
    } catch (error) {
      message = String(error);
    }
    expect(message).not.toContain(FIXTURES.github);
    expect(message).not.toContain(FIXTURES.aws);
  });

  it('does not take a literal fragment beside a variable for a complete value', () => {
    const withVariable = (string: string): unknown => ({
      Value: {
        string,
        attachmentsByRange: {
          [`{${string.length - 1}, 1}`]: { Type: 'Variable', VariableName: 'v' },
        },
      },
      WFSerializationType: 'WFTextTokenString',
    });
    expect(
      found(
        action('downloadurl', {
          WFURL: withVariable('https://host.example.invalid/x?token=clientid1\uFFFC'),
        }),
        action('gettext', { Text: withVariable(`${FIXTURES.highEntropy}\uFFFC`) }),
        action('gettext', { Text: withVariable(`\uFFFC${FIXTURES.highEntropy}`) })
      )
    ).toEqual([]);
    // The same literal values with no variable beside them are still flagged.
    expect(
      found(
        action('downloadurl', { WFURL: 'https://host.example.invalid/x?token=clientid1' }),
        action('gettext', { Text: FIXTURES.highEntropy })
      ).map(f => f.ruleId)
    ).toEqual(['secret-named-field', 'secret-high-entropy']);
  });

  it('still recognizes a token shape when a variable sits beside it', () => {
    const beside = {
      Value: {
        string: `\uFFFC${FIXTURES.github}\uFFFC`,
        attachmentsByRange: {},
      },
      WFSerializationType: 'WFTextTokenString',
    };
    expect(found(action('gettext', { Text: beside })).map(f => f.ruleId)).toEqual([
      'secret-token-format',
    ]);
  });

  it('recognizes a JWT only as three dot-separated segments', () => {
    const header = join('ey', 'J', alnum(16));
    expect(found(action('gettext', { A: `${header}.${header}.${alnum(12)}` }))).toHaveLength(1);
    expect(found(action('gettext', { A: `${header}.${header}` }))).toEqual([]);
    expect(found(action('gettext', { A: `${header}.${header}.${alnum(3)}` }))).toEqual([]);
    expect(found(action('gettext', { A: `${header}.${alnum(16)}.${alnum(12)}` }))).toEqual([]);
    expect(found(action('gettext', { A: `x.${header}.${header}.${alnum(12)}.y` }))).toHaveLength(1);
  });

  it.each([
    ['repeated JWT prefixes with no dot', 'eyJ'.repeat(1_300_000)],
    ['one very long token-character run', 'a'.repeat(3_000_000)],
    ['repeated dots and prefixes', 'eyJ.'.repeat(900_000)],
    ['repeated scheme-like starts', 'a'.repeat(30).repeat(100_000)],
    ['repeated key prefixes', 'sk-'.repeat(1_300_000)],
    ['repeated query markers', '?token='.repeat(500_000)],
  ])('scans %s in linear time', (_label, hostile) => {
    const started = Date.now();
    found(action('gettext', { Text: hostile }));
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('treats plist data and dates as leaves instead of walking every byte', () => {
    const started = Date.now();
    const kinds = found(
      action('gettext', { Blob: new Uint8Array(6_000_000).fill(65), When: new Date(0) })
    );
    expect(kinds).toEqual([]);
    expect(Date.now() - started).toBeLessThan(300);
  });

  it('copes with deep nesting and very large strings quickly', () => {
    let deep: unknown = text(FIXTURES.github);
    for (let i = 0; i < 5000; i++) deep = { child: deep };
    const started = Date.now();
    expect(found(action('gettext', { deep }))).toHaveLength(1);
    expect(found(action('gettext', { big: 'x '.repeat(500_000) + FIXTURES.aws }))).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
