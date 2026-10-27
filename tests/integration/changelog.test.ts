// @vitest-environment node
// scripts/changelog.mjs: fragments in changelog.d/ are validated, then assembled at release.
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/changelog.mjs', import.meta.url));
const roots: string[] = [];

const CHANGELOG = `# Changelog

## [Unreleased]

<!-- Pending entries live in changelog.d/. -->

## [0.1.0] - 2026-01-01

### Added

- First release.
`;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(fragments: Record<string, string>, changelog = CHANGELOG): string {
  const root = mkdtempSync(join(tmpdir(), 'shortcuts-doctor-changelog-'));
  roots.push(root);
  mkdirSync(join(root, 'changelog.d'));
  writeFileSync(join(root, 'changelog.d', 'README.md'), '# Not a fragment\n\nAnything goes.\n');
  for (const [name, text] of Object.entries(fragments)) {
    writeFileSync(join(root, 'changelog.d', name), text);
  }
  writeFileSync(join(root, 'CHANGELOG.md'), changelog);
  return root;
}

function run(root: string, ...args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [script, ...args, '--root', root], { encoding: 'utf8' });
}

const fixed = '### Fixed\n\n- Fixes a bug (#2).\n  Continues here.\n';
const added = '### Added\n\n- Adds a feature (#1).\n\n### Fixed\n\n- Fixes another (#3).\n';

describe('scripts/changelog.mjs', () => {
  it('accepts well-formed fragments and ignores the README', () => {
    const result = run(project({ 'a.md': fixed, 'b.md': added }), 'check');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('changelog: 2 fragment(s) ok\n');
  });

  it.each([
    ['an unknown heading', '### Improved\n\n- x\n', 'unknown section "Improved"'],
    ['an entry before a heading', '- x\n', 'entry before any ### heading'],
    ['a heading with no entries', '### Fixed\n\n### Added\n\n- x\n', '"### Fixed" has no entries'],
    ['free text', '### Fixed\n\nSome prose.\n', 'expected "### <Type>"'],
    ['an empty file', '\n', 'no ### sections'],
  ])('rejects %s with the file and line', (_label, text, message) => {
    const result = run(project({ 'bad.md': text }), 'check');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('changelog.d/bad.md');
    expect(result.stderr).toContain(message);
  });

  it('releases fragments as one section in Keep a Changelog order and deletes them', () => {
    const root = project({ 'b.md': fixed, 'a.md': added });
    const result = run(root, 'release', '1.2.3', '--date', '2026-10-27');
    expect(result.status).toBe(0);
    expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(`# Changelog

## [Unreleased]

<!-- Pending entries live in changelog.d/. -->

## [1.2.3] - 2026-10-27

### Added

- Adds a feature (#1).

### Fixed

- Fixes another (#3).
- Fixes a bug (#2).
  Continues here.

## [0.1.0] - 2026-01-01

### Added

- First release.
`);
    expect(existsSync(join(root, 'changelog.d', 'a.md'))).toBe(false);
    expect(existsSync(join(root, 'changelog.d', 'README.md'))).toBe(true);
  });

  it('refuses to release with no fragments or with hand-written [Unreleased] entries', () => {
    expect(run(project({}), 'release', '1.0.0').stderr).toContain('no fragments');
    const handWritten = CHANGELOG.replace('<!--', '- Stray entry.\n\n<!--');
    const result = run(project({ 'a.md': fixed }, handWritten), 'release', '1.0.0');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('move them into fragments');
  });

  it('rejects malformed versions and prints usage without a command', () => {
    expect(run(project({ 'a.md': fixed }), 'release', 'v1').stderr).toContain('invalid version');
    const usage = run(project({}));
    expect(usage.status).toBe(1);
    expect(usage.stderr).toContain('Usage:');
  });
});
