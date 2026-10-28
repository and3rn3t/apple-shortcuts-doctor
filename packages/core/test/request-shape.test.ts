import { describe, expect, it } from 'vitest';
import { inspectWorkflow, renderMarkdown, renderText, toReportV1 } from '../src/index.ts';
import type { RequestShape } from '../src/index.ts';
import { action, workflow } from './helpers.ts';

const OBJECT = '￼';
const tokenString = (text: string, ...names: string[]): unknown => ({
  Value: {
    string: text,
    attachmentsByRange: Object.fromEntries(
      names.map((name, index) => [`{${index}, 1}`, { Type: 'Variable', VariableName: name }])
    ),
  },
  WFSerializationType: 'WFTextTokenString',
});
const headers = (count: number): unknown => ({
  Value: {
    WFDictionaryFieldValueItems: Array.from({ length: count }, (_, i) => ({
      WFItemType: 0,
      WFKey: { Value: { string: `Key${i}` } },
      WFValue: { Value: { string: `secret-value-${i}` } },
    })),
  },
  WFSerializationType: 'WFDictionaryFieldValue',
});
const shapeOf = (
  parameters: unknown,
  options?: { includeHosts?: boolean }
): RequestShape | undefined =>
  inspectWorkflow(workflow(action('downloadurl', parameters)), options).actions[0]?.request;

describe('request shape', () => {
  it('describes a plain GET with a literal URL and no body', () => {
    expect(shapeOf({ WFURL: 'https://example.invalid/x' })).toEqual({
      url: 'literal',
      method: 'default',
      body: 'none',
      headers: 0,
    });
  });

  it.each([
    [{ WFURL: 'https://example.invalid/x' }, 'literal'],
    [{ WFURL: tokenString('https://example.invalid/x') }, 'literal'],
    [{ WFURL: tokenString(`https://example.invalid/${OBJECT}`, 'id') }, 'dynamic'],
    [{ WFURL: tokenString(OBJECT, 'whole') }, 'dynamic'],
    [
      {
        WFURL: {
          Value: { Type: 'Variable', VariableName: 'u' },
          WFSerializationType: 'WFTextTokenAttachment',
        },
      },
      'dynamic',
    ],
    [{}, 'missing'],
    [{ WFURL: 42 }, 'missing'],
  ])('classifies the URL of %j as %s', (parameters, expected) => {
    expect(shapeOf(parameters)?.url).toBe(expected);
  });

  it.each([
    ['GET', 'get'],
    ['POST', 'post'],
    ['PUT', 'put'],
    ['PATCH', 'patch'],
    ['DELETE', 'delete'],
    ['TELEPORT', 'other'],
    ['post', 'other'],
  ])('maps method %s to %s without echoing anything unknown', (method, expected) => {
    const shape = shapeOf({ WFHTTPMethod: method });
    expect(shape?.method).toBe(expected);
    expect(JSON.stringify(shape)).not.toContain('TELEPORT');
  });

  it('knows a method chosen by a variable, and an absent method', () => {
    expect(shapeOf({ WFHTTPMethod: tokenString(OBJECT, 'm') })?.method).toBe('dynamic');
    expect(
      shapeOf({
        WFHTTPMethod: {
          Value: { Type: 'Variable', VariableName: 'm' },
          WFSerializationType: 'WFTextTokenAttachment',
        },
      })?.method
    ).toBe('dynamic');
    expect(shapeOf({})?.method).toBe('default');
  });

  it.each([
    [{ WFHTTPBodyType: 'JSON', WFJSONValues: {} }, 'json'],
    [{ WFHTTPBodyType: 'Form', WFFormValues: {} }, 'form'],
    [{ WFHTTPBodyType: 'File', WFRequestVariable: {} }, 'file'],
    [{ WFHTTPBodyType: 'Surprise' }, 'unknown'],
    [{ WFJSONValues: {} }, 'unknown'],
    [{ WFRequestVariable: {} }, 'unknown'],
    [{}, 'none'],
  ])('classifies the body of %j as %s', (parameters, expected) => {
    expect(shapeOf(parameters)?.body).toBe(expected);
  });

  it('counts headers and never shows a name or value', () => {
    const shape = shapeOf({ WFHTTPHeaders: headers(3) });
    expect(shape?.headers).toBe(3);
    expect(JSON.stringify(shape)).not.toMatch(/Key\d|secret-value/);
    expect(shapeOf({ WFHTTPHeaders: 'not a dictionary' })?.headers).toBe(0);
  });

  it('is only reported for Get Contents of URL', () => {
    const report = inspectWorkflow(workflow(action('gettext'), action('openurl'), action('url')));
    for (const entry of report.actions) expect(entry).not.toHaveProperty('request');
  });

  it('keeps every value out of the default report', () => {
    const report = inspectWorkflow(
      workflow(
        action('downloadurl', {
          WFURL: 'https://private-host.invalid/secret/path?token=abc',
          WFHTTPMethod: 'POST',
          WFHTTPHeaders: headers(2),
          WFHTTPBodyType: 'JSON',
          WFJSONValues: { secret: 'value' },
        })
      )
    );
    expect(JSON.stringify(report)).not.toMatch(/private-host|secret|token=abc/);
  });

  describe('hosts (opt-in)', () => {
    const host = (url: unknown): string | undefined =>
      shapeOf({ WFURL: url }, { includeHosts: true })?.host;

    it('are absent unless asked for', () => {
      expect(shapeOf({ WFURL: 'https://example.invalid/x' })).not.toHaveProperty('host');
    });

    it.each([
      ['https://Example.Invalid/path?q=1', 'example.invalid'],
      ['http://api.example.invalid:8080/x', 'api.example.invalid'],
      ['https://user:password@host.example.invalid/x', 'host.example.invalid'],
      ['https://host.example.invalid', 'host.example.invalid'],
      [tokenString(`https://fixed.example.invalid/${OBJECT}`, 'id'), 'fixed.example.invalid'],
    ])('reads only the hostname of %j', (url, expected) => {
      expect(host(url)).toBe(expected);
    });

    it.each([
      ['a host that comes from a variable', tokenString(`https://${OBJECT}/x`, 'h')],
      ['part of a host that comes from a variable', tokenString(`https://api.${OBJECT}`, 'h')],
      [
        'a host that a variable continues',
        tokenString(`https://api${OBJECT}.example.invalid/x`, 'h'),
      ],
      ['a URL with no host', 'not a url'],
      ['a host with odd characters', 'https://exa mple.invalid/'],
      ['an IPv6 literal', 'https://[::1]/x'],
      ['no scheme', 'example.invalid/x'],
    ])('leaves the host out for %s', (_label, url) => {
      expect(host(url)).toBeUndefined();
    });

    it('never includes credentials, ports, paths, or queries', () => {
      const shape = shapeOf(
        { WFURL: 'https://user:hunter2@host.example.invalid:8443/private/path?key=abc#frag' },
        { includeHosts: true }
      );
      expect(JSON.stringify(shape)).not.toMatch(/hunter2|8443|private|key=abc|frag|user/);
    });
  });

  it('is shown in text and Markdown, and left out of the legacy shape', () => {
    const report = inspectWorkflow(
      workflow(
        action('downloadurl', {
          WFURL: tokenString(`https://host.example.invalid/${OBJECT}`, 'x'),
          WFHTTPMethod: 'POST',
          WFHTTPBodyType: 'JSON',
          WFHTTPHeaders: headers(2),
        })
      ),
      { includeHosts: true }
    );
    const text = renderText(report);
    expect(text).toContain('{POST, json body, 2 headers, dynamic URL, host host.example.invalid}');
    expect(renderMarkdown(report)).toContain('{POST, json body, 2 headers, dynamic URL');
    expect(toReportV1(report).actions[0]).not.toHaveProperty('request');
  });
});
