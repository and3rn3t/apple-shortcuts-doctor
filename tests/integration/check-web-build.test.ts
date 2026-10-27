// @vitest-environment node
// scripts/check-web-build.mjs: the build guard behind "the file never leaves the browser".
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/check-web-build.mjs', import.meta.url));
const realHeaders = readFileSync(
  fileURLToPath(new URL('../../apps/web/public/_headers', import.meta.url)),
  'utf8'
);
const roots: string[] = [];

const GOOD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><title>Shortcuts Doctor</title>
<script type="module" crossorigin src="/assets/index-abc.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-abc.css">
</head><body><div id="root"></div></body></html>`;
const GOOD_JS = 'const a = 1; export { a };';
const GOOD_CSS = 'body { margin: 0; background: url(data:image/png;base64,AAAA); }';

interface Build {
  html?: string;
  js?: string;
  css?: string;
  headers?: string;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function build({
  html = GOOD_HTML,
  js = GOOD_JS,
  css = GOOD_CSS,
  headers = realHeaders,
}: Build): string {
  const dist = mkdtempSync(join(tmpdir(), 'shortcuts-doctor-web-'));
  roots.push(dist);
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), html);
  writeFileSync(join(dist, 'assets', 'index-abc.js'), js);
  writeFileSync(join(dist, 'assets', 'index-abc.css'), css);
  writeFileSync(join(dist, '_headers'), headers);
  return dist;
}

function check(dist: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [script, '--dist', dist], { encoding: 'utf8' });
}

const withCsp = (replace: (csp: string) => string): string =>
  realHeaders
    .split('\n')
    .map(line => (line.includes('Content-Security-Policy:') ? replace(line) : line))
    .join('\n');
const withoutHeader = (name: string): string =>
  realHeaders
    .split('\n')
    .filter(line => !line.trim().startsWith(`${name}:`))
    .join('\n');

describe('scripts/check-web-build.mjs', () => {
  it('accepts a build with only same-origin resources and the shipped _headers', () => {
    const result = check(build({}));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('check-web-build: ok (4 files, no network APIs, strict CSP)\n');
  });

  it.each([
    ['prefetch(', 'prefetch(url);'],
    ['fetchPriority', 'img.fetchPriority = "high";'],
    ['an identifier ending in eval', 'retrieval(x);'],
    ['a string that only contains a name', 'const label = "Fetching";'],
  ])('does not flag %s, which only resembles a forbidden name', (_label, js) => {
    expect(check(build({ js })).status).toBe(0);
  });

  it.each([
    ['fetch', 'fetch("/x");', 'uses fetch'],
    ['window.fetch', 'window.fetch("/x");', 'uses fetch'],
    ['fetch passed around', 'const f = fetch; f("/x");', 'uses fetch'],
    ['XMLHttpRequest', 'new XMLHttpRequest();', 'uses XMLHttpRequest'],
    ['WebSocket', 'new WebSocket("wss://example.invalid");', 'uses WebSocket'],
    ['EventSource', 'new EventSource("/stream");', 'uses EventSource'],
    ['sendBeacon', 'navigator.sendBeacon("/log", data);', 'uses sendBeacon'],
    ['importScripts', 'importScripts("/x.js");', 'uses importScripts'],
    ['RTCPeerConnection', 'new RTCPeerConnection();', 'uses RTCPeerConnection'],
    ['eval', 'eval("1");', 'dynamic code execution'],
    ['new Function', 'new Function("return 1");', 'dynamic code execution'],
  ])('fails a script that uses %s', (_label, js, message) => {
    const result = check(build({ js }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`assets/index-abc.js: ${message}`);
  });

  it.each([
    [
      'an inline script',
      GOOD_HTML.replace('</body>', '<script>alert(1)</script></body>'),
      'inline <script>',
    ],
    ['an inline handler', GOOD_HTML.replace('<div', '<div onclick="x()"'), 'inline event handler'],
    [
      'a style attribute',
      GOOD_HTML.replace('<div', '<div style="color:red"'),
      'inline event handler',
    ],
    [
      'a <style> element',
      GOOD_HTML.replace('</head>', '<style>a{}</style></head>'),
      '<style> element',
    ],
    [
      'an iframe',
      GOOD_HTML.replace('</body>', '<iframe src="/x"></iframe></body>'),
      '<iframe> element',
    ],
    [
      'an external script',
      GOOD_HTML.replace('/assets/index-abc.js', 'https://cdn.example.invalid/a.js'),
      'external reference "https://cdn.example.invalid/a.js"',
    ],
    [
      'a protocol-relative stylesheet',
      GOOD_HTML.replace('/assets/index-abc.css', '//cdn.example.invalid/a.css'),
      'external reference "//cdn.example.invalid/a.css"',
    ],
    [
      'a single-quoted external link',
      GOOD_HTML.replace('</head>', "<link rel=preload href='http://example.invalid/f'></head>"),
      'external reference "http://example.invalid/f"',
    ],
  ])('fails HTML with %s', (_label, html, message) => {
    const result = check(build({ html }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`index.html: ${message}`);
  });

  it.each([
    ['an @import', '@import url("https://fonts.example.invalid/a.css");'],
    ['a remote url()', 'a { background: url(https://example.invalid/a.png); }'],
    ['a protocol-relative url()', 'a { background: url(//example.invalid/a.png); }'],
  ])('fails CSS with %s', (_label, css) => {
    const result = check(build({ css }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('assets/index-abc.css: external CSS reference');
  });

  it('accepts same-origin and data: CSS references', () => {
    const css =
      '@font-face { src: url(/assets/a.woff2); } a { background: url(data:image/svg+xml,x); }';
    expect(check(build({ css })).status).toBe(0);
  });

  it.each([
    [
      'connect-src opened to self',
      withCsp(l => l.replace("connect-src 'none'", "connect-src 'self'")),
      "connect-src must be 'none'",
    ],
    [
      'connect-src missing',
      withCsp(l => l.replace(" connect-src 'none';", '')),
      "connect-src must be 'none'",
    ],
    [
      'default-src missing',
      withCsp(l => l.replace("default-src 'none'; ", '')),
      "default-src must be 'none'",
    ],
    [
      'unsafe-inline scripts',
      withCsp(l => l.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")),
      'script-src allows "\'unsafe-inline\'"',
    ],
    [
      'a remote host',
      withCsp(l => l.replace("img-src 'self' data:", "img-src 'self' https://cdn.example.invalid")),
      'img-src allows "https://cdn.example.invalid"',
    ],
    ['a wildcard', withCsp(l => l.replace("font-src 'self'", 'font-src *')), 'font-src allows "*"'],
    [
      'a misspelled directive',
      withCsp(l => l.replace('connect-src', 'conect-src')),
      'unknown directive "conect-src"',
    ],
    ['no CSP header', withoutHeader('Content-Security-Policy'), 'sets no Content-Security-Policy'],
    ['no nosniff', withoutHeader('X-Content-Type-Options'), 'needs a valid x-content-type-options'],
    ['no referrer policy', withoutHeader('Referrer-Policy'), 'needs a valid referrer-policy'],
    [
      'no permissions policy',
      withoutHeader('Permissions-Policy'),
      'needs a valid permissions-policy',
    ],
    [
      'no COOP',
      withoutHeader('Cross-Origin-Opener-Policy'),
      'needs a valid cross-origin-opener-policy',
    ],
    [
      'no CORP',
      withoutHeader('Cross-Origin-Resource-Policy'),
      'needs a valid cross-origin-resource-policy',
    ],
    [
      'a line over the Cloudflare limit',
      `${realHeaders}\n  X-Long: ${'a'.repeat(2100)}\n`,
      'limit 2000',
    ],
    ['no /* rule', realHeaders.replace('/*', '/app/*'), 'has no /* rule'],
  ])('fails _headers with %s', (_label, headers, message) => {
    const result = check(build({ headers }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it('reports every problem at once, prefixed with its file', () => {
    const result = check(
      build({
        js: 'fetch("/a"); new WebSocket("x");',
        html: GOOD_HTML.replace('<div', '<div onclick="x()"'),
      })
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('3 problem(s)');
    expect(result.stderr).toContain('assets/index-abc.js: uses fetch');
    expect(result.stderr).toContain('assets/index-abc.js: uses WebSocket');
    expect(result.stderr).toContain('index.html: inline event handler');
  });

  it('fails when the build is missing or incomplete', () => {
    const missing = check(join(tmpdir(), 'shortcuts-doctor-no-such-dist'));
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('build the web app first');
    const empty = mkdtempSync(join(tmpdir(), 'shortcuts-doctor-web-'));
    roots.push(empty);
    const incomplete = check(empty);
    expect(incomplete.status).toBe(1);
    expect(incomplete.stderr).toContain('index.html is missing');
    expect(incomplete.stderr).toContain('_headers is missing');
  });
});
