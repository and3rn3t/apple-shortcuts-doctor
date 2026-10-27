import { decodePlist, isBinaryPlist } from './plist/index.ts';
import type { PlistConverter } from './types.ts';

export const MAX_BYTES = 4 * 1024 * 1024;

const AEA_MAGIC = [0x41, 0x45, 0x41, 0x31]; // "AEA1": Apple Encrypted Archive, used for signed .shortcut files

const SIGNED_EXPORT_MESSAGE =
  'Signed .shortcut files are not decoded, and signatures are never bypassed. ' +
  'See "Getting an export" in the Shortcuts Doctor README.';
const UNSUPPORTED_EXPORT_MESSAGE =
  'Unsupported export. Supply an unsigned plist or JSON export; ' +
  'see "Getting an export" in the Shortcuts Doctor README.';

export interface ParseOptions {
  /** Replaces the built-in XML/binary plist decoder, e.g. to cross-check it in tests. */
  convertPlist?: PlistConverter;
}

function isSignedContainer(bytes: Uint8Array): boolean {
  return AEA_MAGIC.every((byte, index) => bytes[index] === byte);
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
  if (isSignedContainer(bytes)) throw new Error(SIGNED_EXPORT_MESSAGE);
  if (!text.startsWith('<?xml') && !text.startsWith('<plist') && !isBinaryPlist(bytes)) {
    throw new Error(UNSUPPORTED_EXPORT_MESSAGE);
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
