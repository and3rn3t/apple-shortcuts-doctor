import { execFileSync } from 'node:child_process';
import { MAX_BYTES, parseExport as parseWithOptions } from '@shortcuts-doctor/core';
import type { PlistConverter } from '@shortcuts-doctor/core';

const PLUTIL_PATH = '/usr/bin/plutil';
const PLUTIL_TIMEOUT_MS = 5000;

/** Converts plists with macOS's built-in plutil. Converter errors are never echoed. */
export function createPlutilConverter(
  platform: NodeJS.Platform = process.platform
): PlistConverter {
  return (bytes: Uint8Array): unknown => {
    if (platform !== 'darwin') {
      throw new Error(
        'Plist inspection requires macOS plutil. Supply a JSON workflow on this platform.'
      );
    }
    try {
      const json = execFileSync(PLUTIL_PATH, ['-convert', 'json', '-o', '-', '--', '-'], {
        input: bytes,
        timeout: PLUTIL_TIMEOUT_MS,
        maxBuffer: MAX_BYTES * 4,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return JSON.parse(json.toString('utf8'));
    } catch {
      throw new Error(
        'Cannot decode plist as JSON. It may be malformed or contain unsupported plist values.'
      );
    }
  };
}

export function parseExport(
  bytes: Uint8Array,
  platform: NodeJS.Platform = process.platform
): unknown {
  return parseWithOptions(bytes, { convertPlist: createPlutilConverter(platform) });
}
