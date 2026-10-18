import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { MAX_BYTES } from '@shortcuts-doctor/core';

/** Reads at most MAX_BYTES + 1 bytes from a regular file; never follows into FIFOs or directories. */
export function readExport(file: string): Buffer {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('Supply a regular export file.');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    let count: number;
    while (
      length < buffer.length &&
      (count = readSync(fd, buffer, length, buffer.length - length, null)) > 0
    ) {
      length += count;
    }
    if (length > MAX_BYTES) throw new Error('Export exceeds the 4 MiB inspection limit.');
    return buffer.subarray(0, length);
  } finally {
    closeSync(fd);
  }
}
