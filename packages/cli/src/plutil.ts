import { execFileSync } from 'node:child_process';
import { MAX_BYTES, parseExport as parseWithOptions } from '@shortcuts-doctor/core';
import type { ParseOptions } from '@shortcuts-doctor/core';

const PLUTIL_PATH = '/usr/bin/plutil';
const PLUTIL_TIMEOUT_MS = 5000;
const PLUTIL_UNAVAILABLE =
  'Plist inspection requires macOS plutil. Supply a JSON workflow on this platform.';

/** Converts a plist with macOS's built-in plutil. Core replaces any error with a fixed message. */
export function convertWithPlutil(bytes: Uint8Array): unknown {
  const json = execFileSync(PLUTIL_PATH, ['-convert', 'json', '-o', '-', '--', '-'], {
    input: bytes,
    timeout: PLUTIL_TIMEOUT_MS,
    maxBuffer: MAX_BYTES * 4,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  return JSON.parse(json.toString('utf8'));
}

export function parseExport(
  bytes: Uint8Array,
  platform: NodeJS.Platform = process.platform
): unknown {
  const options: ParseOptions =
    platform === 'darwin'
      ? { convertPlist: convertWithPlutil }
      : { plistUnavailableMessage: PLUTIL_UNAVAILABLE };
  return parseWithOptions(bytes, options);
}
