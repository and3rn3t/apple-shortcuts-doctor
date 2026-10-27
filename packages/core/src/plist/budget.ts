/** Deep enough for any real Shortcut (about 10 levels); shallow enough to keep recursion safe. */
export const MAX_DEPTH = 64;
/** Bounds expansion when binary plist objects are referenced many times. */
export const MAX_NODES = 500_000;
/** Bounds string and data bytes, which shared binary references would otherwise copy per visit. */
export const MAX_DECODED_BYTES = 64 * 1024 * 1024;

/** Counts decoded values and nesting so hostile input cannot exhaust the stack or memory. */
export class DecodeBudget {
  private nodes = 0;
  private bytes = 0;

  enter(depth: number): void {
    if (depth > MAX_DEPTH) throw new Error('Plist nesting exceeds the inspection limit.');
    if (++this.nodes > MAX_NODES) throw new Error('Plist has too many values to inspect.');
  }

  /** Call before allocating a decoded string or data value of this many bytes. */
  reserve(byteLength: number): void {
    this.bytes += byteLength;
    if (this.bytes > MAX_DECODED_BYTES) throw new Error('Plist has too much data to inspect.');
  }
}

export type PlistDictionary = { [key: string]: PlistValue };
export type PlistValue =
  string | number | boolean | Date | Uint8Array | PlistValue[] | PlistDictionary;

/** A prototype-less object, so keys such as `__proto__` stay ordinary data. */
export function createDictionary(): PlistDictionary {
  return Object.create(null) as PlistDictionary;
}

/** Apple plist dates count seconds from 2001-01-01T00:00:00Z. */
export const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);
