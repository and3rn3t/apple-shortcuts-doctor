// @vitest-environment node
// Exercises the generated, standalone skill bundle exactly as an installed skill runs it.
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

type BundleApi = typeof import('../../packages/cli/src/index.ts');

const skillDirectory = fileURLToPath(new URL('../../skills/shortcuts-doctor/', import.meta.url));
const script = join(skillDirectory, 'scripts', 'inspect-shortcut.mjs');
const fixture = (name: string): string =>
  fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
const bundle = (await import(script)) as BundleApi;
const temporaryDirectories: string[] = [];

const action = (id: string, parameters: unknown = {}): unknown => ({
  WFWorkflowActionIdentifier: `is.workflow.actions.${id}`,
  WFWorkflowActionParameters: parameters,
});
const workflow = (...actions: unknown[]): unknown => ({ WFWorkflowActions: actions });

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'shortcuts-doctor-'));
  temporaryDirectories.push(directory);
  return directory;
}

function run(args: string[], entrypoint: string = script): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [entrypoint, ...args], { encoding: 'utf8', timeout: 10000 });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('standalone skill bundle', () => {
  it('exposes the documented API', () => {
    expect(bundle.MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(bundle.inspectWorkflow(workflow()).actionCount).toBe(0);
    expect(bundle.parseExport(Buffer.from(JSON.stringify(workflow())))).toEqual(workflow());
  });

  it('works after copying only the skill directory, without writes or code execution', () => {
    const directory = temporaryDirectory();
    const installed = join(directory, 'shortcuts-doctor');
    cpSync(skillDirectory, installed, { recursive: true });
    const file = join(directory, 'export with spaces;$(not-a-command).json');
    const original = JSON.stringify(
      workflow(
        action('runshellscript', { Script: 'do not execute this private payload' }),
        action('sendemail', { Body: 'private email body' })
      )
    );
    writeFileSync(file, original);
    const result = run(['--', file], join(installed, 'scripts', 'inspect-shortcut.mjs'));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).actionCount).toBe(2);
    expect(result.stdout).not.toMatch(/private payload|private email body/);
    expect(readFileSync(file, 'utf8')).toBe(original);
    expect(readFileSync(join(installed, 'SKILL.md'), 'utf8')).toContain('name: shortcuts-doctor');
  });

  it.each(['script', 'directory'])('produces a report through a symlinked %s', target => {
    const directory = temporaryDirectory();
    const link = join(directory, target === 'script' ? 'inspector.mjs' : 'skill');
    symlinkSync(target === 'script' ? script : skillDirectory, link);
    const entrypoint = target === 'script' ? link : join(link, 'scripts', 'inspect-shortcut.mjs');
    const file = join(directory, 'export.json');
    writeFileSync(file, JSON.stringify(workflow(action('text'))));

    const result = run(['--', file], entrypoint);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).actionCount).toBe(1);
  });

  it.each([
    ['json', '"formatVersion"'],
    ['text', 'Shortcuts Doctor:'],
    ['md', '# Shortcuts Doctor report'],
  ])('renders --format %s from the bundle without leaking parameters', (format, expected) => {
    const file = join(temporaryDirectory(), 'export.json');
    writeFileSync(file, JSON.stringify(workflow(action('sendemail', { Body: 'private body' }))));
    const result = run(['--format', format, '--', file]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(expected);
    expect(result.stdout).not.toContain('private body');
  });

  it('emits v2 by default and v1 on request', () => {
    const file = join(temporaryDirectory(), 'export.json');
    writeFileSync(file, JSON.stringify(workflow()));
    expect(JSON.parse(run(['--', file]).stdout).formatVersion).toBe(2);
    const legacy = run(['--format-version', '1', '--', file]);
    expect(JSON.parse(legacy.stdout).formatVersion).toBe(1);
  });

  it('runs the bin entry as the inspect subcommand', () => {
    const file = join(temporaryDirectory(), 'export.json');
    writeFileSync(file, JSON.stringify(workflow(action('sendemail', { Body: 'private body' }))));
    const bin = fileURLToPath(
      new URL('../../packages/cli/bin/shortcuts-doctor.mjs', import.meta.url)
    );
    const result = run(['inspect', '--format', 'md', file], bin);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('# Shortcuts Doctor report');
    expect(result.stdout).not.toContain('private body');
  });

  it('defaults to JSON when piped', () => {
    const file = join(temporaryDirectory(), 'export.json');
    writeFileSync(file, JSON.stringify(workflow()));
    expect(JSON.parse(run(['--', file]).stdout).actionCount).toBe(0);
  });

  it('fails without exposing a missing file path', () => {
    const file = join(temporaryDirectory(), 'private-personal-name.json');
    const result = run(['--', file]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Cannot read the supplied export file.');
    expect(result.stderr).not.toContain('private-personal-name');
  });

  it('rejects directories and oversized files', () => {
    const directory = temporaryDirectory();
    expect(() => bundle.readExport(directory)).toThrow('regular export file');
    const file = join(directory, 'large.json');
    writeFileSync(file, Buffer.alloc(bundle.MAX_BYTES + 1));
    expect(() => bundle.readExport(file)).toThrow('4 MiB');
  });

  it('fails closed for invalid workflows', () => {
    const file = join(temporaryDirectory(), 'invalid.json');
    writeFileSync(file, '{"private personal content":true}');
    const result = run(['--', file]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toContain('private personal content');
  });

  it('provides usage and a nonzero exit code for incorrect arguments', () => {
    const missing = run([]);
    expect(missing.status).toBe(1);
    expect(missing.stdout).toContain('Usage:');
    expect(run(['--help']).status).toBe(0);
  });

  it('inspects the JSON fixture without echoing parameter values', () => {
    const result = run(['--', fixture('mixed-actions.json')]);
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.actionCount).toBe(8);
    expect(report.actions[1].dependsOn).toEqual([1]);
    expect(report.actions[2].dependsOn).toEqual([2]);
    // Action 8 references a UUID declared by both actions 3 and 6.
    expect(report.actions[7].unresolvedReferenceCount).toBe(1);
    expect(result.stdout).not.toMatch(/example\.invalid|echo fixture|Fixture: mixed/);
  });

  it.runIf(process.platform === 'darwin')(
    'produces the same report from an XML plist via the real plutil',
    () => {
      const fromJson = run(['--', fixture('mixed-actions.json')]);
      const fromPlist = run(['--', fixture('mixed-actions.plist')]);
      expect(fromPlist.status).toBe(0);
      expect(fromPlist.stdout).toBe(fromJson.stdout);
    }
  );
});
