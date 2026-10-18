import type { PlistConverter } from './types.ts';

export const MAX_BYTES = 4 * 1024 * 1024;

const BPLIST_MAGIC = [0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x30, 0x30]; // "bplist00"

const DEFAULT_PLIST_UNAVAILABLE =
  'Plist inspection is not available here. Supply a JSON workflow export.';

export interface ParseOptions {
  /** Decodes XML/binary plists. Without one, plist exports are rejected. */
  convertPlist?: PlistConverter;
  /** Fixed, content-free message used when no converter is supplied. */
  plistUnavailableMessage?: string;
}

function isBinaryPlist(bytes: Uint8Array): boolean {
  return BPLIST_MAGIC.every((byte, index) => bytes[index] === byte);
}

/**
 * Decodes an unsigned Shortcut export. Error messages never include file contents.
 * Platform-specific plist decoding is injected so this stays browser-safe.
 */
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
  if (!options.convertPlist) {
    throw new Error(options.plistUnavailableMessage ?? DEFAULT_PLIST_UNAVAILABLE);
  }
  try {
    return options.convertPlist(bytes);
  } catch {
    // Converter errors may quote plist contents; never let them escape.
    throw new Error(
      'Cannot decode plist as JSON. It may be malformed or contain unsupported plist values.'
    );
  }
}
