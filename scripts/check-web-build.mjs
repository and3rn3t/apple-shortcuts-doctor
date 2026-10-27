// Build-time guard for the web app's promise that a dropped export never leaves the browser.
// It checks the built files in dist/ for external or inline resources and for network APIs, and
// checks that dist/_headers carries a CSP that forbids every connection. The CSP is the real
// enforcement; this scan is a tripwire that fails the build before a regression ships. It looks
// for names, so it can't catch deliberately obfuscated code, and a dependency that merely
// mentions one of these names will also fail the build (that is on purpose: look at why).
// Usage: node scripts/check-web-build.mjs [--dist <dir>]   (default: apps/web/dist)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Network, code-loading, and storage APIs that must not appear in any shipped script. */
const FORBIDDEN_APIS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon',
  'importScripts',
  'RTCPeerConnection',
  'WebTransport',
  'eval',
  // The page keeps nothing: an inspected export must not outlive the tab.
  'localStorage',
  'sessionStorage',
  'indexedDB',
];
const FORBIDDEN_CALLS = [/(?<![\w$])Function\s*\(/];
const HTML_FORBIDDEN_TAGS = ['iframe', 'object', 'embed', 'form', 'base', 'style'];
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i;
const INLINE_HANDLER = /\s(?:on[a-z]+|style)\s*=/i;
const REFERENCE_ATTRIBUTE =
  /\s(src|href|action|formaction|poster|srcset|imagesrcset|data|ping)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const CSS_REFERENCE = /(?:@import\s*(?:url\()?\s*|url\(\s*)["']?([^"')\s]+)/gi;

/** CSP sources the web app may use; everything else (hosts, wildcards, unsafe-*) fails. */
const ALLOWED_SOURCES = new Set(["'none'", "'self'", 'data:']);
const KNOWN_DIRECTIVES = new Set([
  'default-src',
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'manifest-src',
  'connect-src',
  'worker-src',
  'media-src',
  'child-src',
  'object-src',
  'base-uri',
  'form-action',
  'frame-ancestors',
]);
const REQUIRED_NONE = ['default-src', 'connect-src', 'base-uri', 'form-action', 'frame-ancestors'];
const REQUIRED_HEADERS = {
  'x-content-type-options': /^nosniff$/i,
  'referrer-policy': /^no-referrer$/i,
  'cross-origin-opener-policy': /^same-origin$/i,
  'cross-origin-resource-policy': /^same-origin$/i,
  'permissions-policy':
    /camera=\(\).*geolocation=\(\).*microphone=\(\)|camera=\(\).*microphone=\(\).*geolocation=\(\)/i,
};
/** Cloudflare rejects `_headers` lines longer than this. */
const MAX_HEADER_LINE = 2000;

/** @param {string} dir @returns {string[]} */
function listFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** @param {string} value */
function isSameOrigin(value) {
  const reference = value.trim();
  return !/^[a-z][a-z0-9+.-]*:/i.test(reference) && !reference.startsWith('//');
}

/** @param {string} html @returns {string[]} */
function checkHtml(html) {
  const problems = [];
  if (INLINE_SCRIPT.test(html)) problems.push('inline <script> (CSP blocks it)');
  for (const tag of HTML_FORBIDDEN_TAGS) {
    if (new RegExp(`<${tag}\\b`, 'i').test(html)) problems.push(`<${tag}> element`);
  }
  if (INLINE_HANDLER.test(html)) problems.push('inline event handler or style attribute');
  for (const match of html.matchAll(REFERENCE_ATTRIBUTE)) {
    const attribute = (match[1] ?? '').toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    const isList = attribute === 'srcset' || attribute === 'imagesrcset';
    // A srcset is a list of "url descriptor" candidates; every url must be same-origin.
    const urls = isList
      ? value.split(',').map(candidate => candidate.trim().split(/\s+/)[0] ?? '')
      : [value];
    for (const url of urls) {
      if (!isSameOrigin(url)) problems.push(`external reference "${url.slice(0, 60)}"`);
    }
  }
  return problems;
}

/** @param {string} css @returns {string[]} */
function checkCss(css) {
  return [...css.matchAll(CSS_REFERENCE)]
    .map(match => match[1] ?? '')
    .filter(value => !value.startsWith('data:') && !isSameOrigin(value))
    .map(value => `external CSS reference "${value.slice(0, 60)}"`);
}

/** @param {string} script @returns {string[]} */
function checkScript(script) {
  const problems = [];
  for (const api of FORBIDDEN_APIS) {
    if (new RegExp(`(?<![\\w$])${api}(?![\\w$])`).test(script)) problems.push(`uses ${api}`);
  }
  for (const pattern of FORBIDDEN_CALLS) {
    if (pattern.test(script)) problems.push(`dynamic code execution (${pattern.source})`);
  }
  return problems;
}

/**
 * Parses a Cloudflare `_headers` file into path rules.
 * @param {string} text
 * @returns {{ pattern: string, headers: Map<string, string>, detached: string[], repeated: string[] }[]}
 */
function parseHeaders(text) {
  /** @type {{ pattern: string, headers: Map<string, string>, detached: string[], repeated: string[] }[]} */
  const rules = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), headers: new Map(), detached: [], repeated: [] });
      continue;
    }
    const rule = rules.at(-1);
    if (!rule) continue;
    if (line.trim().startsWith('!')) {
      rule.detached.push(line.trim().slice(1).trim().toLowerCase());
      continue;
    }
    const separator = line.indexOf(':');
    if (separator > 0) {
      const name = line.slice(0, separator).trim().toLowerCase();
      if (rule.headers.has(name)) rule.repeated.push(name);
      rule.headers.set(name, line.slice(separator + 1).trim());
    }
  }
  return rules;
}

/** @param {string} policy @returns {string[]} */
function checkCsp(policy) {
  const problems = [];
  const directives = new Map();
  for (const part of policy
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)) {
    const [name = '', ...sources] = part.split(/\s+/);
    const directive = name.toLowerCase();
    // Browsers enforce the first occurrence; a later strict copy must not hide a permissive one.
    if (directives.has(directive)) problems.push(`CSP: duplicate directive "${directive}"`);
    else directives.set(directive, sources);
  }
  for (const [name, sources] of directives) {
    if (!KNOWN_DIRECTIVES.has(name)) problems.push(`CSP: unknown directive "${name}"`);
    for (const source of sources) {
      if (!ALLOWED_SOURCES.has(source)) problems.push(`CSP: ${name} allows "${source}"`);
    }
  }
  for (const name of REQUIRED_NONE) {
    if (directives.get(name)?.join(' ') !== "'none'") problems.push(`CSP: ${name} must be 'none'`);
  }
  if (directives.get('script-src')?.join(' ') !== "'self'")
    problems.push("CSP: script-src must be 'self'");
  return problems;
}

/** @param {string} text @returns {string[]} */
function checkHeaders(text) {
  const problems = [];
  const longest = Math.max(...text.split('\n').map(line => line.length));
  if (longest > MAX_HEADER_LINE)
    problems.push(`_headers has a line of ${longest} characters (limit ${MAX_HEADER_LINE})`);
  const rules = parseHeaders(text);
  const protectedHeaders = ['content-security-policy', ...Object.keys(REQUIRED_HEADERS)];
  for (const rule of rules) {
    for (const name of rule.detached.filter(detached => protectedHeaders.includes(detached))) {
      problems.push(`_headers ${rule.pattern} removes ${name} (Cloudflare "! header" detaches it)`);
    }
    for (const name of rule.repeated.filter(repeated => protectedHeaders.includes(repeated))) {
      problems.push(`_headers ${rule.pattern} sets ${name} twice`);
    }
  }
  const everything = rules.find(rule => rule.pattern === '/*');
  if (!everything) return [...problems, '_headers has no /* rule'];
  const csp = everything.headers.get('content-security-policy');
  problems.push(...(csp ? checkCsp(csp) : ['_headers /* sets no Content-Security-Policy']));
  for (const [name, expected] of Object.entries(REQUIRED_HEADERS)) {
    const value = everything.headers.get(name);
    if (!value || !expected.test(value)) problems.push(`_headers /* needs a valid ${name}`);
  }
  return problems;
}

/** @param {string} dist @returns {{ problems: string[], files: number }} */
function checkDist(dist) {
  /** @type {string[]} */
  const problems = [];
  for (const required of ['index.html', '_headers']) {
    if (!existsSync(join(dist, required))) problems.push(`${required} is missing from the build`);
  }
  const files = listFiles(dist);
  for (const file of files) {
    const name = relative(dist, file).split(sep).join('/');
    const text = /\.(?:html|css|m?js)$/.test(file) ? readFileSync(file, 'utf8') : '';
    const found = file.endsWith('.html')
      ? checkHtml(text)
      : file.endsWith('.css')
        ? checkCss(text)
        : /\.m?js$/.test(file)
          ? checkScript(text)
          : name === '_headers'
            ? checkHeaders(readFileSync(file, 'utf8'))
            : [];
    problems.push(...found.map(problem => `${name}: ${problem}`));
  }
  return { problems, files: files.length };
}

const distIndex = process.argv.indexOf('--dist');
const dist =
  distIndex > 0 && process.argv[distIndex + 1]
    ? /** @type {string} */ (process.argv[distIndex + 1])
    : fileURLToPath(new URL('../apps/web/dist', import.meta.url));

if (!existsSync(dist)) {
  process.stderr.write(`check-web-build: ${dist} does not exist; build the web app first.\n`);
  process.exit(1);
}
const { problems, files } = checkDist(dist);
if (problems.length) {
  process.stderr.write(
    `check-web-build: ${problems.length} problem(s)\n${problems.map(p => `  - ${p}`).join('\n')}\n`
  );
  process.exit(1);
}
process.stdout.write(
  `check-web-build: ok (${files} files, no network or storage APIs, strict CSP)\n`
);
