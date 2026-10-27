import { parseBinaryPlist } from './binary.ts';
import { DecodeBudget } from './budget.ts';
import { parseXmlPlist } from './xml.ts';

export type { PlistDictionary, PlistValue } from './budget.ts';
export { MAX_DECODED_BYTES, MAX_DEPTH, MAX_NODES } from './budget.ts';

const BPLIST_MAGIC = [0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x30, 0x30]; // "bplist00"

export function isBinaryPlist(bytes: Uint8Array): boolean {
  return BPLIST_MAGIC.every((byte, index) => bytes[index] === byte);
}

/** Decodes an XML or binary plist with shared depth and size limits. Browser-safe. */
export function decodePlist(bytes: Uint8Array): unknown {
  const budget = new DecodeBudget();
  return isBinaryPlist(bytes) ? parseBinaryPlist(bytes, budget) : parseXmlPlist(bytes, budget);
}
