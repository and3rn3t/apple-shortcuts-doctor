// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_BYTES } from '@shortcuts-doctor/core';
import { parseExport } from '../src/plutil.ts';

vi.mock('node:child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));

const emptyWorkflow = { WFWorkflowActions: [] };

afterEach(() => {
  vi.resetAllMocks();
});

describe('plutil plist conversion', () => {
  it('never invokes plutil for JSON exports', () => {
    expect(parseExport(Buffer.from(JSON.stringify(emptyWorkflow)), 'darwin')).toEqual(
      emptyWorkflow
    );
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it.each(['<?xml version="1.0"?><plist/>', '<plist/>', 'bplist00content'])(
    'only converts recognized plist formats on macOS: %j',
    content => {
      const buffer = Buffer.from(content);
      expect(() => parseExport(buffer, 'linux')).toThrow('requires macOS');
      expect(execFileSync).not.toHaveBeenCalled();
      vi.mocked(execFileSync).mockReturnValue(Buffer.from(JSON.stringify(emptyWorkflow)));
      expect(parseExport(buffer, 'darwin')).toEqual(emptyWorkflow);
      expect(execFileSync).toHaveBeenCalledWith(
        '/usr/bin/plutil',
        ['-convert', 'json', '-o', '-', '--', '-'],
        expect.objectContaining({
          input: buffer,
          timeout: 5000,
          maxBuffer: MAX_BYTES * 4,
          stdio: ['pipe', 'pipe', 'ignore'],
        })
      );
    }
  );

  it('does not leak converter errors or unsupported plist values', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('private converter content');
    });
    expect(() => parseExport(Buffer.from('<plist/>'), 'darwin')).toThrow(
      'Cannot decode plist as JSON.'
    );
  });
});
