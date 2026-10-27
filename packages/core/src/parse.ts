import type { PlistConverter } from './types.ts';

export const MAX_BYTES = 4 * 1024 * 1024;

const BPLIST_MAGIC = [0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x30, 0x30]; // "bplist00"
const AEA_MAGIC = [0x41, 0x45, 0x41, 0x31]; // "AEA1": Apple Encrypted Archive, used for signed .shortcut files

const SIGNED_EXPORT_MESSAGE =
  'Signed .shortcut files are not decoded, and signatures are never bypassed. ' +
  'See "Getting an export" in the Shortcuts Doctor README.';
const UNSUPPORTED_EXPORT_MESSAGE =
  'Unsupported export. Supply an unsigned plist or JSON export; ' +
  'see "Getting an export" in the Shortcuts Doctor README.';

const DEFAULT_PLIST_UNAVAILABLE =
  'Plist inspection is not available here. Supply a JSON workflow export.';

export interface ParseOptions {
  /** Decodes XML/binary plists. Without one, plist exports are rejected. */
  convertPlist?: PlistConverter;
  /** Fixed, content-free message used when no converter is supplied. */
  plistUnavailableMessage?: string;
}

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((byte, index) => bytes[index] === byte);
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
  if (startsWith(bytes, AEA_MAGIC)) throw new Error(SIGNED_EXPORT_MESSAGE);
  if (!text.startsWith('<?xml') && !text.startsWith('<plist') && !startsWith(bytes, BPLIST_MAGIC)) {
    throw new Error(UNSUPPORTED_EXPORT_MESSAGE);
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
