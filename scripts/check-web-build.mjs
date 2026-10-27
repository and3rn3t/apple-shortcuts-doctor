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
const SERVICE_WORKER = 'sw.js';
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

/**
 * @param {string} script
 * @param {string} name path of the script inside dist
 * @returns {string[]}
 */
function checkScript(script, name) {
  const problems = [];
  for (const api of FORBIDDEN_APIS) {
    // The service worker fetches the files it precaches; no other script may fetch anything.
    if (api === 'fetch' && name === SERVICE_WORKER) continue;
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

/**
 * @param {string} policy
 * @param {boolean} [forWorker] the service worker's own policy: it may connect to its own origin
 * (to precache) and nowhere else, and loads no scripts
 * @returns {string[]}
 */
function checkCsp(policy, forWorker = false) {
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
  const requiredNone = forWorker ? ['default-src'] : REQUIRED_NONE;
  for (const name of requiredNone) {
    if (directives.get(name)?.join(' ') !== "'none'") problems.push(`CSP: ${name} must be 'none'`);
  }
  if (forWorker) {
    if (directives.get('connect-src')?.join(' ') !== "'self'")
      problems.push("CSP: connect-src must be 'self'");
  } else if (directives.get('script-src')?.join(' ') !== "'self'") {
    problems.push("CSP: script-src must be 'self'");
  }
  return problems;
}

/**
 * The service worker's rule must replace the page policy (every matching rule applies, so a second
 * policy added without detaching would leave both enforced and break precaching) with a strict one.
 * @param {{ pattern: string, headers: Map<string, string>, detached: string[] }} rule
 * @returns {string[]}
 */
function checkWorkerRule(rule) {
  const policy = rule.headers.get('content-security-policy');
  if (!rule.detached.includes('content-security-policy'))
    return [`_headers ${rule.pattern} sets a CSP without detaching the page policy first`];
  if (!policy) return [`_headers ${rule.pattern} detaches the CSP but sets no replacement`];
  return checkCsp(policy, true).map(problem => `${rule.pattern} ${problem}`);
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
    const workerRule = rule.pattern === `/${SERVICE_WORKER}`;
    for (const name of rule.detached.filter(detached => protectedHeaders.includes(detached))) {
      // The one exception: the service worker swaps the page policy for its own (see below).
      if (workerRule && name === 'content-security-policy') continue;
      problems.push(`_headers ${rule.pattern} removes ${name} (Cloudflare "! header" detaches it)`);
    }
    if (workerRule) problems.push(...checkWorkerRule(rule));
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

/** Files the platform serves or that are the worker itself: never precached. */
const NOT_PRECACHED = new Set(['_headers', SERVICE_WORKER]);
const BUILD_MANIFEST = /\/\* @build \*\/\s*(\{[\s\S]*?\})\s*\/\* @end \*\//;

/**
 * The worker precaches exactly the files of the build, so the app works offline and the worker
 * can't be coaxed into serving or fetching anything else.
 * @param {string} dist
 * @param {string[]} names every file in dist, as forward-slash relative paths
 * @returns {string[]}
 */
function checkServiceWorker(dist, names) {
  if (!names.includes(SERVICE_WORKER)) return [`${SERVICE_WORKER} is missing from the build`];
  const match = BUILD_MANIFEST.exec(readFileSync(join(dist, SERVICE_WORKER), 'utf8'));
  if (!match) return [`${SERVICE_WORKER} has no build manifest`];
  /** @type {{ cache?: unknown, files?: unknown }} */
  let build;
  try {
    build = JSON.parse(match[1] ?? '');
  } catch {
    return [`${SERVICE_WORKER} build manifest is not valid JSON`];
  }
  const problems = [];
  if (typeof build.cache !== 'string' || !/^shortcuts-doctor-[0-9a-f]{12}$/.test(build.cache))
    problems.push('build manifest has no content-derived cache name');
  const files = Array.isArray(build.files) ? build.files : [];
  if (!files.length || files.some(file => typeof file !== 'string'))
    return [...problems, 'build manifest has no file list'];
  const listed = /** @type {string[]} */ (files);
  for (const file of listed) {
    if (!/^\/[A-Za-z0-9._\-/]*$/.test(file) || file.includes('..') || file.includes('//'))
      problems.push(`precaches a suspicious path "${file.slice(0, 60)}"`);
  }
  const expected = names
    .filter(name => !NOT_PRECACHED.has(name))
    .map(name => (name === 'index.html' ? '/' : `/${name}`));
  for (const file of expected.filter(file => !listed.includes(file)))
    problems.push(`does not precache ${file}, so the app would not work offline`);
  for (const file of listed.filter(file => !expected.includes(file)))
    problems.push(`precaches ${file}, which is not in the build`);
  if (new Set(listed).size !== listed.length) problems.push('precache list has duplicates');
  return problems;
}

/**
 * @param {string} dist
 * @param {string[]} names
 * @returns {string[]}
 */
function checkManifest(dist, names) {
  if (!names.includes('manifest.webmanifest')) return ['manifest.webmanifest is missing'];
  /** @type {{ name?: unknown, start_url?: unknown, display?: unknown, icons?: unknown }} */
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'));
  } catch {
    return ['manifest.webmanifest is not valid JSON'];
  }
  const problems = [];
  for (const field of ['name', 'start_url', 'display']) {
    if (typeof manifest[/** @type {'name'} */ (field)] !== 'string')
      problems.push(`has no ${field}`);
  }
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const icon of icons) {
    const source = typeof icon?.src === 'string' ? icon.src : '';
    if (!source.startsWith('/') || !names.includes(source.slice(1)))
      problems.push(`icon "${source.slice(0, 60)}" is not in the build`);
  }
  const sizes = icons.map(
    icon => `${icon?.sizes}${icon?.purpose === 'maskable' ? ' maskable' : ''}`
  );
  for (const needed of ['192x192', '512x512', '512x512 maskable']) {
    if (!sizes.includes(needed)) problems.push(`has no ${needed} icon`);
  }
  return problems.map(problem => `manifest.webmanifest ${problem}`);
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
          ? checkScript(text, name)
          : name === '_headers'
            ? checkHeaders(readFileSync(file, 'utf8'))
            : [];
    problems.push(...found.map(problem => `${name}: ${problem}`));
  }
  const names = files.map(file => relative(dist, file).split(sep).join('/'));
  problems.push(
    ...checkServiceWorker(dist, names).map(problem => `${SERVICE_WORKER}: ${problem}`),
    ...checkManifest(dist, names)
  );
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
