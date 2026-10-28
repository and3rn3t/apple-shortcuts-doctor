// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { MAX_BYTES } from '@shortcuts-doctor/core';
import { main } from '../src/main.ts';
import { readExport } from '../src/read-export.ts';

let directory: string;
let stdout: MockInstance<typeof process.stdout.write>;
let stderr: MockInstance<typeof process.stderr.write>;

const output = (stream: MockInstance<typeof process.stdout.write>): string =>
  stream.mock.calls.map(([chunk]) => String(chunk)).join('');

function writeExport(name: string, contents: string | Buffer): string {
  const file = join(directory, name);
  writeFileSync(file, contents);
  return file;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'shortcuts-doctor-cli-'));
  stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

describe('readExport', () => {
  it('reads a regular file', () => {
    const file = writeExport('export.json', '{"WFWorkflowActions":[]}');
    expect(readExport(file).toString('utf8')).toBe('{"WFWorkflowActions":[]}');
  });

  it('rejects directories and oversized files', () => {
    expect(() => readExport(directory)).toThrow('regular export file');
    const file = writeExport('large.json', Buffer.alloc(MAX_BYTES + 1));
    expect(() => readExport(file)).toThrow('4 MiB');
  });
});

describe('main', () => {
  it('prints a JSON report for one file argument after --', () => {
    const file = writeExport('export.json', '{"WFWorkflowActions":[]}');
    expect(main(['--', file])).toBe(0);
    expect(JSON.parse(output(stdout)).actionCount).toBe(0);
    expect(output(stderr)).toBe('');
  });

  it.each([
    [true, 'Shortcuts Doctor:'],
    [false, '"formatVersion"'],
  ])('defaults by terminal state (isTTY=%s)', (isTTY, expected) => {
    const original = process.stdout.isTTY;
    process.stdout.isTTY = isTTY;
    try {
      const file = writeExport('export.json', '{"WFWorkflowActions":[]}');
      expect(main(['--', file])).toBe(0);
      expect(output(stdout)).toContain(expected);
    } finally {
      process.stdout.isTTY = original;
    }
  });

  it('lets --format json override the terminal default', () => {
    const original = process.stdout.isTTY;
    process.stdout.isTTY = true;
    try {
      const file = writeExport('export.json', '{"WFWorkflowActions":[]}');
      expect(main(['--format', 'json', '--', file])).toBe(0);
      expect(JSON.parse(output(stdout)).actionCount).toBe(0);
    } finally {
      process.stdout.isTTY = original;
    }
  });

  it.each([
    ['text', 'Shortcuts Doctor:'],
    ['md', '# Shortcuts Doctor report'],
  ])('renders --format %s', (format, expected) => {
    const file = writeExport('export.json', '{"WFWorkflowActions":[]}');
    expect(main(['--format', format, '--', file])).toBe(0);
    expect(output(stdout)).toContain(expected);
  });

  it('emits the legacy shape with --format-version 1', () => {
    const file = writeExport('export.json', '{"WFWorkflowActions":[]}');
    expect(main(['--format', 'json', '--format-version', '1', '--', file])).toBe(0);
    const report = JSON.parse(output(stdout));
    expect(report.formatVersion).toBe(1);
    expect(report).not.toHaveProperty('summary');
  });

  describe('--show-variable-names', () => {
    const exportWithVariable = (): string =>
      writeExport(
        'vars.json',
        JSON.stringify({
          WFWorkflowActions: [
            {
              WFWorkflowActionIdentifier: 'is.workflow.actions.setvariable',
              WFWorkflowActionParameters: { WFVariableName: 'My Secret Name' },
            },
          ],
        })
      );

    it('leaves variable names out by default', () => {
      expect(main(['--format', 'json', '--', exportWithVariable()])).toBe(0);
      expect(output(stdout)).not.toContain('My Secret Name');
    });

    it('includes them only with the flag, in JSON and text', () => {
      expect(main(['--format', 'json', '--show-variable-names', '--', exportWithVariable()])).toBe(
        0
      );
      expect(JSON.parse(output(stdout)).actions[0].variableNames).toEqual(['My Secret Name']);
      stdout.mockClear();
      expect(main(['--format', 'text', '--show-variable-names', '--', exportWithVariable()])).toBe(
        0
      );
      expect(output(stdout)).toContain('{variables My Secret Name}');
    });

    it('is listed in the usage text', () => {
      main(['--help']);
      expect(output(stdout)).toContain('--show-variable-names');
    });
  });

  it.each([['--format-version', '3'], ['--format-version']])('rejects %j', (...args) => {
    expect(main([...args, 'x'])).toBe(1);
    expect(output(stdout)).toContain('Usage:');
  });

  it('accepts the inspect subcommand with flags', () => {
    const file = writeExport('export.json', '{"WFWorkflowActions":[]}');
    expect(main(['inspect', '--format', 'md', file])).toBe(0);
    expect(output(stdout)).toContain('# Shortcuts Doctor report');
  });

  it('treats inspect after -- as a file name, not a subcommand', () => {
    expect(main(['--', 'inspect'])).toBe(1);
    expect(output(stderr)).toContain('Cannot read');
  });

  it('requires a file for the inspect subcommand', () => {
    expect(main(['inspect'])).toBe(1);
    expect(output(stdout)).toContain('Usage:');
  });

  describe('--fail-on and --quiet', () => {
    const emailOnly =
      '{"WFWorkflowActions":[{"WFWorkflowActionIdentifier":"is.workflow.actions.sendemail"}]}';
    const scriptRun =
      '{"WFWorkflowActions":[{"WFWorkflowActionIdentifier":"is.workflow.actions.runshellscript"}]}';

    it('exits 2 at the review threshold and still prints the report', () => {
      const file = writeExport('review.json', emailOnly);
      expect(main(['--fail-on', 'review', '--', file])).toBe(2);
      expect(JSON.parse(output(stdout)).actionCount).toBe(1);
      expect(output(stderr)).toBe(
        "Shortcuts Doctor: 1 finding(s) at or above 'review' severity.\n"
      );
    });

    it('does not fail review-only findings at the warning threshold', () => {
      const file = writeExport('review.json', emailOnly);
      expect(main(['--fail-on', 'warning', '--', file])).toBe(0);
      expect(output(stderr)).toBe('');
    });

    it('fails warning findings at the warning threshold', () => {
      const file = writeExport('warning.json', scriptRun);
      expect(main(['--fail-on', 'warning', '--', file])).toBe(2);
    });

    it('passes a clean export', () => {
      const file = writeExport('clean.json', '{"WFWorkflowActions":[]}');
      expect(main(['--fail-on', 'review', '--', file])).toBe(0);
    });

    it('suppresses the report with --quiet but keeps the exit code', () => {
      const file = writeExport('warning.json', scriptRun);
      expect(main(['--quiet', '--fail-on', 'review', '--', file])).toBe(2);
      expect(output(stdout)).toBe('');
      expect(output(stderr)).not.toContain('runshellscript');
    });

    it('prints nothing for --quiet without --fail-on', () => {
      const file = writeExport('clean.json', '{"WFWorkflowActions":[]}');
      expect(main(['--quiet', '--', file])).toBe(0);
      expect(output(stdout)).toBe('');
    });

    it.each([['--fail-on', 'error'], ['--fail-on']])('rejects %j', (...args) => {
      expect(main([...args, 'x'])).toBe(1);
      expect(output(stdout)).toContain('Usage:');
    });
  });

  it('accepts --option=value syntax', () => {
    const file = writeExport('export.json', '{"WFWorkflowActions":[]}');
    expect(main(['--format=md', file])).toBe(0);
    expect(output(stdout)).toContain('# Shortcuts Doctor report');
  });

  it.each([
    [['--bogus', 'x'], '--bogus'],
    [['inspect', '--bogus=private-value', 'x'], '--bogus'],
    [['-x', 'file'], '-x'],
    [['--version'.padEnd(60, 'z')], `--version${'z'.repeat(31)}`],
    [['--b\u001bad'], '--b?ad'],
    [['--constructor', 'x'], '--constructor'],
    [['--toString', 'x'], '--toString'],
    [['--__proto__', 'x'], '--__proto__'],
  ])('names unknown option %j without echoing values', (args, name) => {
    expect(main(args)).toBe(1);
    expect(output(stderr)).toBe(
      `Shortcuts Doctor: Unknown option: ${name}. Run --help for usage.\n`
    );
    expect(output(stdout)).toBe('');
    expect(output(stderr)).not.toContain('private-value');
  });

  it('rejects a value on a boolean flag with usage', () => {
    expect(main(['--quiet=yes', 'x'])).toBe(1);
    expect(output(stdout)).toContain('Usage:');
    expect(output(stdout) + output(stderr)).not.toContain('yes');
  });

  it.each([['--version'], ['-v'], ['inspect', '--version']])(
    'prints the version for %j',
    (...args) => {
      expect(main(args)).toBe(0);
      expect(output(stdout)).toMatch(/^\d+\.\d+\.\d+\n$/);
    }
  );

  it('prints usage and succeeds for -h', () => {
    expect(main(['-h'])).toBe(0);
    expect(output(stdout)).toContain('-v, --version');
  });

  it.each(['__proto__', 'toString', 'constructor', 'hasOwnProperty'])(
    'treats the inherited property name %j as a file, not a subcommand',
    name => {
      expect(main([name])).toBe(1);
      expect(output(stderr)).toBe('Shortcuts Doctor: Cannot read the supplied export file.\n');
    }
  );

  it('treats option-like names after -- as file names', () => {
    expect(main(['--', '--bogus'])).toBe(1);
    expect(output(stderr)).toBe('Shortcuts Doctor: Cannot read the supplied export file.\n');
  });

  it('rejects unknown formats', () => {
    expect(main(['--format', 'xml', 'x'])).toBe(1);
    expect(output(stdout)).toContain('Usage:');
  });

  it.each([[[]], [['a', 'b']], [['--']]])('prints usage and fails for %j', args => {
    expect(main(args)).toBe(1);
    expect(output(stdout)).toContain('Usage:');
  });

  it('prints usage and succeeds for --help', () => {
    expect(main(['--help'])).toBe(0);
    expect(output(stdout)).toContain('Usage:');
  });

  it('hides filesystem paths in read errors', () => {
    expect(main([join(directory, 'private-name.json')])).toBe(1);
    expect(output(stderr)).toBe('Shortcuts Doctor: Cannot read the supplied export file.\n');
  });

  it('reports inspection errors without echoing contents', () => {
    const file = writeExport('bad.json', '{"private content":true}');
    expect(main([file])).toBe(1);
    expect(output(stderr)).toContain('WFWorkflowActions');
    expect(output(stderr)).not.toContain('private content');
    expect(output(stdout)).toBe('');
  });
});
