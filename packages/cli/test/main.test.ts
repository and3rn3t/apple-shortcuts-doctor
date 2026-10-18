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

  it.each([['--format-version', '3'], ['--format-version']])('rejects %j', (...args) => {
    expect(main([...args, 'x'])).toBe(1);
    expect(output(stdout)).toContain('Usage:');
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
