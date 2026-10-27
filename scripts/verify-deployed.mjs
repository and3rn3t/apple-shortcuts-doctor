#!/usr/bin/env node
// Verifies a deployed web app against the build it came from: every file in the build directory
// must be served at its URL with identical bytes and the headers `_headers` promises. Polls until
// that holds or the timeout passes, since a new deployment can take a moment to reach the edge.
// A byte mismatch also catches content injected at the edge (analytics beacons, rewrites).
// Usage: node scripts/verify-deployed.mjs <base-url> <dist-dir> [--timeout seconds] [--interval seconds]
//   (CI: .github/workflows/release.yml, deploy-web job)
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const HEADERS_FILE = '_headers';
const REQUEST_TIMEOUT_SECONDS = 30;

/** @param {string} message @returns {never} */
function usage(message) {
  console.error(`verify-deployed: ${message}`);
  console.error(
    'usage: node scripts/verify-deployed.mjs <base-url> <dist-dir> [--timeout seconds] [--interval seconds]'
  );
  process.exit(2);
}

/** @param {string} directory @returns {string[]} paths relative to `directory`, with "/" separators */
function listFiles(directory) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} current */
  const walk = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(relative(directory, full).split(sep).join('/'));
    }
  };
  walk(directory);
  return found.sort();
}

/**
 * Parses a Workers `_headers` file into path rules. Only literal paths and the `/*` catch-all are
 * supported, which is all this app uses; anything else is an error rather than silently ignored.
 * @param {string} text
 * @returns {{ path: string, set: Map<string, string>, detach: Set<string> }[]}
 */
function parseHeaders(text) {
  /** @type {{ path: string, set: Map<string, string>, detach: Set<string> }[]} */
  const rules = [];
  /** @type {{ path: string, set: Map<string, string>, detach: Set<string> } | undefined} */
  let current;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      if (line !== '/*' && /[*:]/.test(line)) throw new Error(`unsupported _headers path: ${line}`);
      current = { path: line, set: new Map(), detach: new Set() };
      rules.push(current);
      continue;
    }
    if (!current) throw new Error(`header before any path in _headers: ${line.trim()}`);
    const body = line.trim();
    if (body.startsWith('!')) {
      current.detach.add(body.slice(1).trim().toLowerCase());
      continue;
    }
    const colon = body.indexOf(':');
    if (colon < 1) throw new Error(`malformed _headers line: ${body}`);
    current.set.set(body.slice(0, colon).trim().toLowerCase(), body.slice(colon + 1).trim());
  }
  return rules;
}

/**
 * The headers a response for `urlPath` must carry. Every matching rule applies; an exact-path
 * rule's `! Name` removes what the catch-all added, and its own value replaces it.
 * @param {ReturnType<typeof parseHeaders>} rules
 * @param {string} urlPath
 * @returns {Map<string, string | null>} header name to required value, or null where it must be absent
 */
function expectedHeaders(rules, urlPath) {
  /** @type {Map<string, string | null>} */
  const expected = new Map();
  for (const rule of rules.filter(candidate => candidate.path === '/*')) {
    for (const [name, value] of rule.set) expected.set(name, value);
  }
  for (const rule of rules.filter(candidate => candidate.path === urlPath)) {
    for (const name of rule.detach) expected.set(name, null);
    for (const [name, value] of rule.set) expected.set(name, value);
  }
  return expected;
}

/** @param {string} file @returns {string} the URL path serving a build file */
function urlPathOf(file) {
  if (file === 'index.html') return '/';
  return `/${file}`;
}

/** @param {Buffer | Uint8Array} bytes */
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * Checks every build file against the deployment once.
 * @param {string} baseUrl
 * @param {string} directory
 * @returns {Promise<string[]>} problems found; empty when the deployment matches the build
 */
async function checkOnce(baseUrl, directory) {
  const rules = parseHeaders(readFileSync(join(directory, HEADERS_FILE), 'utf8'));
  const files = listFiles(directory).filter(file => file !== HEADERS_FILE);
  if (files.length === 0) return ['the build directory has no files to compare'];
  /** @type {string[]} */
  const problems = [];
  for (const file of files) {
    const urlPath = urlPathOf(file);
    const url = new URL(urlPath, baseUrl).href;
    let response;
    try {
      response = await fetch(url, {
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_SECONDS * 1000),
      });
    } catch (error) {
      problems.push(
        `${urlPath}: request failed (${error instanceof Error ? error.message : error})`
      );
      continue;
    }
    if (response.status !== 200) {
      problems.push(`${urlPath}: HTTP ${response.status}, expected 200`);
      continue;
    }
    const served = sha256(new Uint8Array(await response.arrayBuffer()));
    if (served !== sha256(readFileSync(join(directory, file)))) {
      problems.push(`${urlPath}: served bytes differ from the build`);
    }
    for (const [name, value] of expectedHeaders(rules, urlPath)) {
      const actual = response.headers.get(name);
      if (actual !== value) {
        const wanted = value === null ? 'absent' : `"${value}"`;
        problems.push(
          `${urlPath}: header ${name} is ${actual === null ? 'missing' : `"${actual}"`}, expected ${wanted}`
        );
      }
    }
  }
  return problems;
}

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** @param {string[]} argv */
function parseArguments(argv) {
  const positional = [];
  let timeout = 300;
  let interval = 10;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    if (argument === '--timeout' || argument === '--interval') {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0)
        usage(`${argument} needs a positive number of seconds`);
      if (argument === '--timeout') timeout = value;
      else interval = value;
      index += 1;
    } else if (argument.startsWith('--')) {
      usage(`unknown option ${argument}`);
    } else {
      positional.push(argument);
    }
  }
  const [baseUrl, directory] = positional;
  if (positional.length !== 2 || !baseUrl || !directory) usage('expected <base-url> <dist-dir>');
  return { baseUrl, directory, timeout, interval };
}

async function main() {
  const { baseUrl, directory, timeout, interval } = parseArguments(process.argv.slice(2));
  const deadline = Date.now() + timeout * 1000;
  for (;;) {
    const problems = await checkOnce(baseUrl, directory);
    if (problems.length === 0) {
      console.log(
        `verify-deployed: ok (${baseUrl} serves the build byte-for-byte with its headers)`
      );
      return;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      console.error(`verify-deployed: ${baseUrl} does not match the build after ${timeout}s:`);
      for (const problem of problems) console.error(`  - ${problem}`);
      process.exit(1);
    }
    console.log(`verify-deployed: not yet (${problems[0]}); retrying`);
    await sleep(Math.min(interval * 1000, remaining));
  }
}

await main();
