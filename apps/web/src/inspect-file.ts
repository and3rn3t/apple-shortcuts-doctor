import { inspectWorkflow, isSignedExport, MAX_BYTES, parseExport } from '@shortcuts-doctor/core';
import type { Report } from '@shortcuts-doctor/core';

/** Same text as core's own limit error, so a too-large file is refused before it is read. */
export const TOO_LARGE_MESSAGE = 'Export exceeds the 4 MiB inspection limit.';
export const UNREADABLE_MESSAGE = 'Could not read that file.';
const UNEXPECTED_MESSAGE = 'Could not inspect that file.';

export type Outcome =
  { kind: 'report'; report: Report } | { kind: 'error'; message: string; signed: boolean };

/**
 * Decodes and inspects export bytes. Core's errors are fixed, content-free messages, so they are
 * safe to show; anything that is not an Error gets a generic message instead.
 */
export function inspectBytes(bytes: Uint8Array): Outcome {
  try {
    return { kind: 'report', report: inspectWorkflow(parseExport(bytes)) };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : UNEXPECTED_MESSAGE,
      signed: isSignedExport(bytes),
    };
  }
}

/** Reads a user-chosen file in the page and inspects it. The file is never sent anywhere. */
export async function inspectFile(file: File): Promise<Outcome> {
  if (file.size > MAX_BYTES) return { kind: 'error', message: TOO_LARGE_MESSAGE, signed: false };
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { kind: 'error', message: UNREADABLE_MESSAGE, signed: false };
  }
  return inspectBytes(bytes);
}
