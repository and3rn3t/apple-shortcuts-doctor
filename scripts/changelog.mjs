// Changelog fragments: each PR adds a file to changelog.d/ instead of editing CHANGELOG.md, so
// concurrent PRs never conflict. A release assembles the fragments into one CHANGELOG section.
// Usage:
//   node scripts/changelog.mjs check                    validate changelog.d/*.md
//   node scripts/changelog.mjs preview                  print the next release section
//   node scripts/changelog.mjs release X.Y.Z [--date YYYY-MM-DD]
// Every command accepts --root <dir> (default: the repository root).
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Keep a Changelog section order. */
const TYPES = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];
const HEADING = /^### (\w+)$/;
const FRAGMENT_DIR = 'changelog.d';
const UNRELEASED = '## [Unreleased]';

/** @typedef {Record<string, string[]>} Sections bullet entries (with continuation lines) by type */

class FragmentError extends Error {}

/**
 * @param {string} file
 * @param {string} text
 * @returns {Sections}
 */
function parseFragment(file, text) {
  /** @type {Sections} */
  const sections = {};
  /** @type {string[] | undefined} */
  let entries;
  text.split('\n').forEach((line, index) => {
    const where = `${file}:${index + 1}`;
    const heading = HEADING.exec(line);
    if (heading) {
      const type = /** @type {string} */ (heading[1]);
      if (!TYPES.includes(type)) throw new FragmentError(`${where}: unknown section "${type}"`);
      entries = sections[type] ??= [];
    } else if (line.startsWith('- ')) {
      if (!entries) throw new FragmentError(`${where}: entry before any ### heading`);
      entries.push(line);
    } else if (line.startsWith('  ') && line.trim()) {
      if (!entries?.length) throw new FragmentError(`${where}: continuation without an entry`);
      entries[entries.length - 1] += `\n${line}`;
    } else if (line.trim()) {
      throw new FragmentError(`${where}: expected "### <Type>", "- entry", or an indented line`);
    }
  });
  if (!Object.keys(sections).length) throw new FragmentError(`${file}: no ### sections`);
  for (const [type, list] of Object.entries(sections)) {
    if (!list.length) throw new FragmentError(`${file}: "### ${type}" has no entries`);
  }
  return sections;
}

/** @param {string} root @returns {{ files: string[], sections: Sections }} */
function readFragments(root) {
  const dir = join(root, FRAGMENT_DIR);
  const files = readdirSync(dir)
    .filter(name => name.endsWith('.md') && name !== 'README.md')
    .sort();
  /** @type {Sections} */
  const sections = {};
  for (const name of files) {
    const parsed = parseFragment(`${FRAGMENT_DIR}/${name}`, readFileSync(join(dir, name), 'utf8'));
    for (const [type, list] of Object.entries(parsed)) (sections[type] ??= []).push(...list);
  }
  return { files: files.map(name => join(dir, name)), sections };
}

/** @param {Sections} sections @returns {string} */
function renderSections(sections) {
  return TYPES.filter(type => sections[type])
    .map(type => `### ${type}\n\n${(sections[type] ?? []).join('\n')}\n`)
    .join('\n');
}

/** @param {string} root @param {string} version @param {string} date */
function release(root, version, date) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new FragmentError(`invalid version "${version}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new FragmentError(`invalid date "${date}"`);
  const { files, sections } = readFragments(root);
  if (!files.length) throw new FragmentError(`no fragments in ${FRAGMENT_DIR}/ to release`);
  const path = join(root, 'CHANGELOG.md');
  const changelog = readFileSync(path, 'utf8');
  const start = changelog.indexOf(UNRELEASED);
  const next = changelog.indexOf('\n## [', start + UNRELEASED.length);
  if (start < 0 || next < 0) throw new FragmentError('CHANGELOG.md has no [Unreleased] section');
  if (changelog.slice(start, next).includes('\n- ')) {
    throw new FragmentError('CHANGELOG.md [Unreleased] has entries; move them into fragments');
  }
  const section = `## [${version}] - ${date}\n\n${renderSections(sections)}`;
  writeFileSync(path, `${changelog.slice(0, next + 1)}${section}\n${changelog.slice(next + 1)}`);
  for (const file of files) rmSync(file);
  return files.length;
}

/** @param {string[]} argv @returns {{ command: string, args: string[], root: string, date: string }} */
function parseArgv(argv) {
  const options = new Map();
  const args = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = /** @type {string} */ (argv[index]);
    if (arg === '--root' || arg === '--date') options.set(arg, argv[++index]);
    else args.push(arg);
  }
  return {
    command: args[0] ?? '',
    args: args.slice(1),
    root: options.get('--root') ?? fileURLToPath(new URL('..', import.meta.url)),
    date: options.get('--date') ?? new Date().toISOString().slice(0, 10),
  };
}

const { command, args, root, date } = parseArgv(process.argv.slice(2));
try {
  if (command === 'check') {
    const { files } = readFragments(root);
    process.stdout.write(`changelog: ${files.length} fragment(s) ok\n`);
  } else if (command === 'preview') {
    process.stdout.write(renderSections(readFragments(root).sections));
  } else if (command === 'release' && args[0]) {
    const count = release(root, args[0], date);
    process.stdout.write(`changelog: released ${args[0]} from ${count} fragment(s)\n`);
  } else {
    process.stderr.write('Usage: node scripts/changelog.mjs check | preview | release X.Y.Z\n');
    process.exitCode = 1;
  }
} catch (error) {
  if (!(error instanceof FragmentError)) throw error;
  process.stderr.write(`changelog: ${error.message}\n`);
  process.exitCode = 1;
}
