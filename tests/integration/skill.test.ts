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

  describe('variables, magic tokens, and names', () => {
    const variable = (name: string): unknown => ({
      Value: { Type: 'Variable', VariableName: name },
    });
    const withVariables = (): string => {
      const file = join(temporaryDirectory(), 'variables.json');
      writeFileSync(
        file,
        JSON.stringify(
          workflow(
            action('setvariable', { WFVariableName: 'Private Variable Name' }),
            action('gettext', {
              A: variable('Private Variable Name'),
              B: { Value: { Type: 'Clipboard' } },
              C: variable('private-unset-name'),
            }),
            action('setvariable', { WFVariableName: `evil\u0007${'x'.repeat(100)}` })
          )
        )
      );
      return file;
    };

    it.each([
      [
        'text',
        [
          '<~ #1',
          '{reads clipboard}',
          '1 unset variable(s)',
          'Reads the clipboard through a variable token',
        ],
      ],
      ['md', ['<~ #1', '{reads clipboard}', 'Reads the clipboard through a variable token']],
    ])('links variables and reports the clipboard token in %s', (format, expected) => {
      const result = run(['--format', format, '--', withVariables()]);
      expect(result.status).toBe(0);
      for (const text of expected) expect(result.stdout).toContain(text);
    });

    it('links variables and reports the clipboard token in JSON', () => {
      const report = JSON.parse(run(['--', withVariables()]).stdout);
      expect(report.actions[1]).toMatchObject({
        usesVariables: [1],
        unresolvedVariableCount: 1,
        magicInputs: ['clipboard'],
      });
      expect(report.findings).toContainEqual(
        expect.objectContaining({ code: 'sensitive-input', ruleId: 'clipboard-token' })
      );
    });

    it.each(['json', 'text', 'md'])('omits variable names by default in %s', format => {
      const result = run(['--format', format, '--', withVariables()]);
      expect(result.stdout).not.toMatch(/Private Variable Name|private-unset-name|evil/);
    });

    it('includes sanitized, shortened names only with --show-variable-names', () => {
      const result = run(['--show-variable-names', '--', withVariables()]);
      const names: string[] = JSON.parse(result.stdout).actions.flatMap(
        (entry: { variableNames?: string[] }) => entry.variableNames ?? []
      );
      expect(names).toContain('Private Variable Name');
      for (const name of names) {
        expect(name).toMatch(/^[\x20-\x7e]+$/);
        expect(name.length).toBeLessThanOrEqual(63);
      }
      expect(
        run(['--show-variable-names', '--format', 'text', '--', withVariables()]).stdout
      ).toContain('{variables Private Variable Name}');
    });

    it('leaves all of it out of the legacy v1 report, even with names requested', () => {
      const result = run(['--format-version', '1', '--show-variable-names', '--', withVariables()]);
      const legacy = JSON.parse(result.stdout);
      expect(legacy.formatVersion).toBe(1);
      expect(legacy.actions[1]).not.toHaveProperty('usesVariables');
      expect(legacy.actions[1]).not.toHaveProperty('magicInputs');
      expect(legacy.actions[1]).not.toHaveProperty('variableNames');
      expect(result.stdout).not.toContain('Private Variable Name');
    });
  });

  describe('possible flows from sensitive inputs to outbound actions', () => {
    const file = (): string => {
      const path = join(temporaryDirectory(), 'flow.json');
      writeFileSync(
        path,
        JSON.stringify(
          workflow(
            action('getclipboard', { UUID: 'private-uuid' }),
            action('downloadurl', {
              WFURL: 'https://private.invalid/secret',
              WFInput: { Value: { OutputUUID: 'private-uuid' } },
            })
          )
        )
      );
      return path;
    };

    it('reports the path in JSON, text and Markdown without any value', () => {
      const json = JSON.parse(run(['--', file()]).stdout);
      expect(json.findings).toContainEqual(
        expect.objectContaining({
          code: 'possible-flow',
          severity: 'warning',
          paths: [{ actions: [1, 2], inferred: false }],
        })
      );
      const text = run(['--format', 'text', '--', file()]).stdout;
      expect(text).toContain('possible path: #1 -> #2');
      const markdown = run(['--format', 'md', '--', file()]).stdout;
      expect(markdown).toContain('  - possible path: #1 -> #2');
      for (const output of [JSON.stringify(json), text, markdown]) {
        expect(output).not.toMatch(/private-uuid|private.invalid|secret/);
      }
    });

    it('counts as a warning for --fail-on, and leaves paths out of v1', () => {
      expect(run(['--quiet', '--fail-on', 'warning', '--', file()]).status).toBe(2);
      const legacy = JSON.parse(run(['--format-version', '1', '--', file()]).stdout);
      for (const finding of legacy.findings) expect(finding).not.toHaveProperty('paths');
    });
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
      new URL('../../packages/cli/dist/shortcuts-doctor.mjs', import.meta.url)
    );
    const result = run(['inspect', '--format', 'md', file], bin);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('# Shortcuts Doctor report');
    expect(result.stdout).not.toContain('private body');
  });

  it('exits 2 from the bundle when --fail-on is reached', () => {
    const file = join(temporaryDirectory(), 'export.json');
    writeFileSync(file, JSON.stringify(workflow(action('runshellscript'))));
    const result = run(['--quiet', '--fail-on', 'warning', '--', file]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
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

  it.each([[['-']], [['--', '-']], [['inspect', '-']]])(
    'reads a piped export from stdin for %j',
    args => {
      const input = readFileSync(fixture('mixed-actions.json'));
      const result = spawnSync(process.execPath, [script, ...args], {
        input,
        encoding: 'utf8',
        timeout: 10000,
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).actionCount).toBe(8);
      expect(result.stderr).toBe('');
    }
  );

  it('applies the 4 MiB limit to stdin', () => {
    const result = spawnSync(process.execPath, [script, '--', '-'], {
      input: Buffer.alloc(bundle.MAX_BYTES + 1, 0x20),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('Shortcuts Doctor: Export exceeds the 4 MiB inspection limit.\n');
  });

  it('fails closed on empty stdin', () => {
    const result = spawnSync(process.execPath, [script, '-'], {
      input: '',
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });

  it('prints the package version baked in at build time', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../packages/cli/package.json', import.meta.url), 'utf8')
    ) as { version: string };
    const result = run(['--version']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${manifest.version}\n`);
  });

  it('names an unknown option from the bundle', () => {
    const result = run(['--bogus', 'x']);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      'Shortcuts Doctor: Unknown option: --bogus. Run --help for usage.\n'
    );
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

  it.each(['mixed-actions.plist', 'mixed-actions.binary.plist'])(
    'produces the same report from %s as from JSON, on any OS',
    name => {
      const fromJson = run(['--', fixture('mixed-actions.json')]);
      const fromPlist = run(['--', fixture(name)]);
      expect(fromPlist.status).toBe(0);
      expect(fromPlist.stdout).toBe(fromJson.stdout);
    }
  );
});
