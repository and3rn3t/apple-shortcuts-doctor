import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { isatty } from 'node:tty';
import { MAX_BYTES } from '@shortcuts-doctor/core';

export const STDIN_ARGUMENT = '-';
const STDIN_FD = 0;
const RETRY_DELAY_MS = 10;

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

/** A pipe left non-blocking by the parent reports EAGAIN until data arrives; wait and retry. */
function readChunk(fd: number, buffer: Buffer, offset: number): number {
  for (;;) {
    try {
      return readSync(fd, buffer, offset, buffer.length - offset, null);
    } catch (error) {
      if (!hasCode(error, 'EAGAIN')) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAY_MS);
    }
  }
}

/** Reads at most MAX_BYTES + 1 bytes so oversized input is rejected without buffering all of it. */
function readBounded(fd: number): Buffer {
  const buffer = Buffer.alloc(MAX_BYTES + 1);
  let length = 0;
  let count: number;
  while (length < buffer.length && (count = readChunk(fd, buffer, length)) > 0) {
    length += count;
  }
  if (length > MAX_BYTES) throw new Error('Export exceeds the 4 MiB inspection limit.');
  return buffer.subarray(0, length);
}

/** Reads piped stdin; refuses an interactive terminal instead of waiting for input forever. */
function readStdin(): Buffer {
  if (isatty(STDIN_FD)) throw new Error("Pipe an export into stdin when using '-'.");
  return readBounded(STDIN_FD);
}

/** Reads a regular file, or stdin for `-`; never follows into FIFOs or directories by path. */
export function readExport(file: string): Buffer {
  if (file === STDIN_ARGUMENT) return readStdin();
  const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('Supply a regular export file.');
    return readBounded(fd);
  } finally {
    closeSync(fd);
  }
}
