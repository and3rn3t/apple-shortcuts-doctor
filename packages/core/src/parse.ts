import { decodePlist, isBinaryPlist } from './plist/index.ts';
import type { PlistConverter } from './types.ts';

export const MAX_BYTES = 4 * 1024 * 1024;

export interface ParseOptions {
  /** Replaces the built-in XML/binary plist decoder, e.g. to cross-check it in tests. */
  convertPlist?: PlistConverter;
}

/** Decodes an unsigned Shortcut export (JSON, XML or binary plist). Errors never include contents. */
export function parseExport(bytes: Uint8Array, options: ParseOptions = {}): unknown {
  if (bytes.length > MAX_BYTES) throw new Error('Export exceeds the 4 MiB inspection limit.');
  const text = new TextDecoder()
    .decode(bytes)
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON export. Supply a complete workflow dictionary.');
    }
  }
  if (!text.startsWith('<?xml') && !text.startsWith('<plist') && !isBinaryPlist(bytes)) {
    throw new Error(
      'Unsupported export. Signed containers are not decoded; supply unsigned plist or JSON.'
    );
  }
  const convertPlist = options.convertPlist ?? decodePlist;
  try {
    return convertPlist(bytes);
  } catch {
    // Decoder errors may describe plist contents; never let them escape.
    throw new Error(
      'Cannot decode plist. It may be malformed, nested too deeply, or use unsupported plist values.'
    );
  }
}
