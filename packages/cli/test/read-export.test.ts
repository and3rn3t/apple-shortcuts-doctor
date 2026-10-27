// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const tty = vi.hoisted(() => ({ isatty: vi.fn<(fd: number) => boolean>() }));
vi.mock('node:tty', () => tty);

const { readExport } = await import('../src/read-export.ts');

afterEach(() => {
  vi.resetAllMocks();
});

describe('readExport from stdin', () => {
  it('refuses an interactive terminal instead of waiting for input', () => {
    tty.isatty.mockReturnValue(true);
    expect(() => readExport('-')).toThrow("Pipe an export into stdin when using '-'.");
    expect(tty.isatty).toHaveBeenCalledWith(0);
  });
});
