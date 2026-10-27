// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tty = vi.hoisted(() => ({ isatty: vi.fn<(fd: number) => boolean>() }));
vi.mock('node:tty', () => tty);

// Wrap readSync so a test can inject one failure, then fall through to the real implementation.
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readSync: vi.fn(actual.readSync) };
});

const fs = await import('node:fs');
const { readExport } = await import('../src/read-export.ts');
const readSync = vi.mocked(fs.readSync);

let directory: string;

function errorWithCode(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: simulated`), { code });
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'shortcuts-doctor-read-'));
});

afterEach(() => {
  vi.clearAllMocks();
  tty.isatty.mockReset();
  rmSync(directory, { recursive: true, force: true });
});

describe('readExport from stdin', () => {
  it('refuses an interactive terminal instead of waiting for input', () => {
    tty.isatty.mockReturnValue(true);
    expect(() => readExport('-')).toThrow("Pipe an export into stdin when using '-'.");
    expect(tty.isatty).toHaveBeenCalledWith(0);
  });

  it('reads piped stdin through the same bounded reader', () => {
    tty.isatty.mockReturnValue(false);
    const input = Buffer.from('{"WFWorkflowActions":[]}');
    readSync
      .mockImplementationOnce((_fd, buffer) => {
        input.copy(buffer as Buffer);
        return input.length;
      })
      .mockImplementationOnce(() => 0);
    expect(readExport('-').toString('utf8')).toBe('{"WFWorkflowActions":[]}');
    expect(readSync.mock.calls.every(([fd]) => fd === 0)).toBe(true);
  });
});

describe('readExport retries', () => {
  it('waits and retries when a non-blocking descriptor reports EAGAIN', () => {
    const file = join(directory, 'export.json');
    writeFileSync(file, '{"WFWorkflowActions":[]}');
    readSync.mockImplementationOnce(() => {
      throw errorWithCode('EAGAIN');
    });
    expect(readExport(file).toString('utf8')).toBe('{"WFWorkflowActions":[]}');
    // The failed attempt, the real read, and the end-of-file read.
    expect(readSync).toHaveBeenCalledTimes(3);
  });

  it('rethrows any other read error instead of retrying', () => {
    const file = join(directory, 'export.json');
    writeFileSync(file, '{"WFWorkflowActions":[]}');
    readSync.mockImplementationOnce(() => {
      throw errorWithCode('EIO');
    });
    expect(() => readExport(file)).toThrow('EIO: simulated');
    expect(readSync).toHaveBeenCalledTimes(1);
  });
});
