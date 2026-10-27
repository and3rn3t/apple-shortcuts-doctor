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

const ICONS = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const GOOD_MANIFEST = JSON.stringify({
  name: 'Shortcuts Doctor',
  start_url: '/',
  display: 'standalone',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
});
const PRECACHED = [
  '/',
  '/assets/index-abc.css',
  '/assets/index-abc.js',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/manifest.webmanifest',
];
const CACHE_NAME = 'shortcuts-doctor-0123456789ab';

/** A service worker with the build manifest the plugin writes, plus optional extra code. */
const worker = (files: string[] = PRECACHED, extra = '', cache = CACHE_NAME): string =>
  `const BUILD = /* @build */ ${JSON.stringify({ cache, files })} /* @end */;\n` +
  `self.addEventListener('fetch', () => {});\n${extra}\n`;

interface Build {
  html?: string;
  js?: string;
  css?: string;
  headers?: string;
  serviceWorker?: string;
  manifest?: string;
  /** Files (relative to dist) to leave out. */
  omit?: string[];
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function build({
  html = GOOD_HTML,
  js = GOOD_JS,
  css = GOOD_CSS,
  headers = realHeaders,
  serviceWorker = worker(),
  manifest = GOOD_MANIFEST,
  omit = [],
}: Build): string {
  const dist = mkdtempSync(join(tmpdir(), 'shortcuts-doctor-web-'));
  roots.push(dist);
  mkdirSync(join(dist, 'assets'));
  const files: Record<string, string> = {
    'index.html': html,
    'assets/index-abc.js': js,
    'assets/index-abc.css': css,
    _headers: headers,
    'sw.js': serviceWorker,
    'manifest.webmanifest': manifest,
    ...Object.fromEntries(ICONS.map(icon => [icon, 'png'])),
  };
  for (const [name, text] of Object.entries(files)) {
    if (!omit.includes(name)) writeFileSync(join(dist, name), text);
  }
  return dist;
}

function check(dist: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [script, '--dist', dist], { encoding: 'utf8' });
}

/** Edits the page rule's CSP line (the one containing connect-src 'none'); the worker has its own. */
const withCsp = (replace: (csp: string) => string): string =>
  realHeaders
    .split('\n')
    .map(line =>
      line.includes('Content-Security-Policy:') && line.includes("connect-src 'none'")
        ? replace(line)
        : line
    )
    .join('\n');
/** Removes the page rule's copy of a header, keeping everything else (including the worker rule). */
const withoutHeader = (name: string): string => {
  const lines = realHeaders.split('\n');
  const index = lines.findIndex(line => line.trim().startsWith(`${name}:`));
  return lines.filter((_, position) => position !== index).join('\n');
};

describe('scripts/check-web-build.mjs', () => {
  it('accepts a build with only same-origin resources and the shipped _headers', () => {
    const result = check(build({}));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      'check-web-build: ok (9 files, no network or storage APIs, strict CSP)\n'
    );
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
    ['localStorage', 'localStorage.setItem("k", "v");', 'uses localStorage'],
    ['window.sessionStorage', 'window.sessionStorage.getItem("k");', 'uses sessionStorage'],
    ['indexedDB', 'indexedDB.open("db");', 'uses indexedDB'],
    ['eval', 'eval("1");', 'uses eval'],
    ['window.eval', 'window.eval("1");', 'uses eval'],
    ['globalThis.eval', 'globalThis.eval("1");', 'uses eval'],
    ['indirect eval', '(0, eval)("1");', 'uses eval'],
    ['new Function', 'new Function("return 1");', 'dynamic code execution'],
    ['Function without new', 'Function("return 1")();', 'dynamic code execution'],
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
      'a remote srcset candidate after a local one',
      GOOD_HTML.replace(
        '</body>',
        '<img srcset="/assets/a.png 1x, https://cdn.example.invalid/b.png 2x"></body>'
      ),
      'external reference "https://cdn.example.invalid/b.png"',
    ],
    [
      'a remote imagesrcset',
      GOOD_HTML.replace(
        '</head>',
        '<link rel=preload as=image imagesrcset="//cdn.example.invalid/a.png 1x"></head>'
      ),
      'external reference "//cdn.example.invalid/a.png"',
    ],
    [
      'a remote formaction',
      GOOD_HTML.replace(
        '</body>',
        '<button formaction="https://example.invalid/x">x</button></body>'
      ),
      'external reference "https://example.invalid/x"',
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

  it('accepts a srcset whose candidates are all same-origin', () => {
    const html = GOOD_HTML.replace(
      '</body>',
      '<img srcset="/a.png 1x, /b.png 2x, c.png 3x"></body>'
    );
    expect(check(build({ html })).status).toBe(0);
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
      'a permissive directive hidden before a strict duplicate',
      withCsp(l => l.replace("connect-src 'none'", "connect-src 'self'; connect-src 'none'")),
      'duplicate directive "connect-src"',
    ],
    [
      'a strict directive followed by a permissive duplicate',
      withCsp(l => l.replace("connect-src 'none'", "connect-src 'none'; connect-src 'self'")),
      'duplicate directive "connect-src"',
    ],
    [
      'the CSP detached for one page',
      `${realHeaders}/index.html\n  ! Content-Security-Policy\n`,
      '_headers /index.html removes content-security-policy',
    ],
    [
      'a required header detached for one path',
      `${realHeaders}/app/*\n  ! X-Content-Type-Options\n`,
      '_headers /app/* removes x-content-type-options',
    ],
    [
      'the CSP set twice in one rule',
      realHeaders.replace(
        '  X-Content-Type-Options',
        "  Content-Security-Policy: default-src 'none'; connect-src 'none'\n  X-Content-Type-Options"
      ),
      '_headers /* sets content-security-policy twice',
    ],
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

  it('accepts a more specific rule that adds its own header without removing the CSP', () => {
    const headers = `${realHeaders}/other.js\n  Cache-Control: no-store\n  Content-Security-Policy: default-src 'none'; connect-src 'none'\n`;
    expect(check(build({ headers })).status).toBe(0);
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

describe('service worker', () => {
  it('may fetch (to precache), but no other forbidden API', () => {
    expect(check(build({ serviceWorker: worker(PRECACHED, 'fetch("/x");') })).status).toBe(0);
    for (const [code, message] of [
      ['new XMLHttpRequest();', 'uses XMLHttpRequest'],
      ['new WebSocket("wss://x.invalid");', 'uses WebSocket'],
      ['navigator.sendBeacon("/x");', 'uses sendBeacon'],
      ['localStorage.setItem("a", "b");', 'uses localStorage'],
      ['eval("1");', 'uses eval'],
    ] as const) {
      const result = check(build({ serviceWorker: worker(PRECACHED, code) }));
      expect(result.status, code).toBe(1);
      expect(result.stderr, code).toContain(`sw.js: ${message}`);
    }
  });

  it('still forbids fetch in every other script', () => {
    const result = check(build({ js: 'fetch("/x");' }));
    expect(result.stderr).toContain('assets/index-abc.js: uses fetch');
  });

  it.each([
    ['is missing', { omit: ['sw.js'] }, 'sw.js is missing from the build'],
    [
      'has no build manifest',
      { serviceWorker: 'self.addEventListener("fetch", () => {});' },
      'has no build manifest',
    ],
    [
      'has an unparsable build manifest',
      { serviceWorker: '/* @build */ {"cache": } /* @end */' },
      'build manifest is not valid JSON',
    ],
    [
      'has a cache name not derived from content',
      { serviceWorker: worker(PRECACHED, '', 'shortcuts-doctor-dev') },
      'no content-derived cache name',
    ],
    [
      'forgets a file, so the app would not work offline',
      { serviceWorker: worker(PRECACHED.filter(file => file !== '/icon-512.png')) },
      'does not precache /icon-512.png, so the app would not work offline',
    ],
    [
      'precaches a file that is not in the build',
      { serviceWorker: worker([...PRECACHED, '/ghost.js']) },
      'precaches /ghost.js, which is not in the build',
    ],
    [
      'precaches a path that climbs out',
      { serviceWorker: worker([...PRECACHED, '/../secret']) },
      'suspicious path "/../secret"',
    ],
    [
      'precaches another origin',
      { serviceWorker: worker([...PRECACHED, '//cdn.example.invalid/a.js']) },
      'suspicious path "//cdn.example.invalid/a.js"',
    ],
    [
      'precaches with a query string',
      { serviceWorker: worker([...PRECACHED, '/assets/index-abc.js?x=1']) },
      'suspicious path',
    ],
    [
      'lists a file twice',
      { serviceWorker: worker([...PRECACHED, '/icon-192.png']) },
      'precache list has duplicates',
    ],
  ] satisfies [string, Build, string][])('fails when sw.js %s', (_label, options, message) => {
    const result = check(build(options));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });
});

describe('web app manifest', () => {
  it.each([
    ['is missing', { omit: ['manifest.webmanifest'] }, 'manifest.webmanifest is missing'],
    ['is not JSON', { manifest: '{nope' }, 'manifest.webmanifest is not valid JSON'],
    [
      'has no name',
      { manifest: JSON.stringify({ ...JSON.parse(GOOD_MANIFEST), name: undefined }) },
      'manifest.webmanifest has no name',
    ],
    [
      'names an icon that is not in the build',
      {
        omit: ['icon-512.png'],
        serviceWorker: worker(PRECACHED.filter(file => file !== '/icon-512.png')),
      },
      'icon "/icon-512.png" is not in the build',
    ],
    [
      'has no maskable icon',
      {
        manifest: JSON.stringify({
          ...JSON.parse(GOOD_MANIFEST),
          icons: JSON.parse(GOOD_MANIFEST).icons.slice(0, 2),
        }),
      },
      'has no 512x512 maskable icon',
    ],
  ] satisfies [string, Build, string][])('fails when it %s', (_label, options, message) => {
    const result = check(build(options));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });
});

describe('the service worker’s CSP exception', () => {
  const swRule =
    "/sw.js\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'none'; connect-src 'self'\n";
  const withoutSwRule = realHeaders.slice(0, realHeaders.indexOf('/sw.js'));
  const withSwRule = (rule: string): string => `${withoutSwRule}${rule}`;

  it('accepts the shipped rule, which detaches the page policy and sets its own', () => {
    expect(realHeaders).toContain(swRule);
    expect(check(build({ headers: withSwRule(swRule) })).status).toBe(0);
  });

  it('rejects headers with no /sw.js rule, which would leave the worker unable to precache', () => {
    const result = check(build({ headers: withoutSwRule }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('_headers has no /sw.js rule');
  });

  it.each([
    [
      'sets a policy without detaching the page one, so both would apply',
      "/sw.js\n  Content-Security-Policy: default-src 'none'; connect-src 'self'\n",
      '/sw.js sets a CSP without detaching the page policy first',
    ],
    [
      'detaches the page policy and sets nothing',
      '/sw.js\n  ! Content-Security-Policy\n',
      '/sw.js detaches the CSP but sets no replacement',
    ],
    [
      'lets the worker connect to another origin',
      "/sw.js\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'none'; connect-src 'self' https://cdn.example.invalid\n",
      'connect-src allows "https://cdn.example.invalid"',
    ],
    [
      'lets the worker connect anywhere',
      "/sw.js\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'none'; connect-src *\n",
      'connect-src allows "*"',
    ],
    [
      'forgets default-src',
      "/sw.js\n  ! Content-Security-Policy\n  Content-Security-Policy: connect-src 'self'\n",
      "/sw.js CSP: default-src must be 'none'",
    ],
    [
      'denies the worker its own origin, so it could not precache',
      "/sw.js\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'none'; connect-src 'none'\n",
      "/sw.js CSP: connect-src must be 'self'",
    ],
    [
      'allows inline script in the worker policy',
      "/sw.js\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'\n",
      'script-src allows "\'unsafe-inline\'"',
    ],
    [
      'detaches another required header for the worker',
      `${swRule}  ! X-Content-Type-Options\n`,
      '/sw.js removes x-content-type-options',
    ],
  ])('rejects a rule that %s', (_label, rule, message) => {
    const result = check(build({ headers: withSwRule(rule) }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it('grants the exception to /sw.js and nowhere else', () => {
    for (const path of ['/index.html', '/assets/*', '/sw.js/', '/*.js']) {
      const rule = `${path}\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'none'; connect-src 'self'\n`;
      const result = check(build({ headers: `${withSwRule(swRule)}${rule}` }));
      expect(result.status, path).toBe(1);
      expect(result.stderr, path).toContain(`_headers ${path} removes content-security-policy`);
    }
  });
});
