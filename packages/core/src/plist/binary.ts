import { APPLE_EPOCH_MS, createDictionary, DecodeBudget } from './budget.ts';
import type { PlistDictionary, PlistValue } from './budget.ts';

const HEADER_LENGTH = 8; // "bplist00"
const TRAILER_LENGTH = 32;

function fail(): never {
  throw new Error('Malformed binary plist.');
}

interface Trailer {
  offsetSize: number;
  refSize: number;
  objectCount: number;
  topObject: number;
  tableOffset: number;
}

/** Reads a big-endian unsigned integer of 1 to 8 bytes, rejecting values beyond 2^53. */
function readUnsigned(view: DataView, offset: number, size: number): number {
  if (size < 1 || size > 8 || offset < 0 || offset + size > view.byteLength) fail();
  let value = 0n;
  for (let index = 0; index < size; index++) {
    value = (value << 8n) | BigInt(view.getUint8(offset + index));
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail();
  return Number(value);
}

function readTrailer(view: DataView): Trailer {
  if (view.byteLength < HEADER_LENGTH + TRAILER_LENGTH) fail();
  const start = view.byteLength - TRAILER_LENGTH;
  const trailer: Trailer = {
    offsetSize: view.getUint8(start + 6),
    refSize: view.getUint8(start + 7),
    objectCount: readUnsigned(view, start + 8, 8),
    topObject: readUnsigned(view, start + 16, 8),
    tableOffset: readUnsigned(view, start + 24, 8),
  };
  const tableEnd = trailer.tableOffset + trailer.objectCount * trailer.offsetSize;
  const valid =
    trailer.offsetSize >= 1 &&
    trailer.offsetSize <= 8 &&
    trailer.refSize >= 1 &&
    trailer.refSize <= 8 &&
    trailer.objectCount >= 1 &&
    trailer.objectCount <= view.byteLength &&
    trailer.topObject < trailer.objectCount &&
    trailer.tableOffset >= HEADER_LENGTH &&
    tableEnd <= start;
  if (!valid) fail();
  return trailer;
}

// Native decoders keep hostile input that is large but within the byte budget fast to reject.
const UTF8 = new TextDecoder('utf-8');
const UTF16_BE = new TextDecoder('utf-16be');

/** ASCII is a subset of UTF-8, so once every byte is checked the native decoder is exact. */
function decodeAscii(bytes: Uint8Array): string {
  if (bytes.some(byte => byte > 0x7f)) fail();
  return UTF8.decode(bytes);
}

function decodeUtf16(bytes: Uint8Array): string {
  return UTF16_BE.decode(bytes);
}

/** Walks the object graph from the top object. Every offset and reference is bounds-checked. */
class BinaryPlistReader {
  private readonly bytes: Uint8Array;
  private readonly budget: DecodeBudget;
  private readonly view: DataView;
  private readonly trailer: Trailer;
  private readonly active = new Set<number>();

  constructor(bytes: Uint8Array, budget: DecodeBudget) {
    this.bytes = bytes;
    this.budget = budget;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.trailer = readTrailer(this.view);
  }

  read(): PlistValue {
    return this.readObject(this.trailer.topObject, 1);
  }

  private objectOffset(ref: number): number {
    const { tableOffset, offsetSize } = this.trailer;
    const offset = readUnsigned(this.view, tableOffset + ref * offsetSize, offsetSize);
    if (offset < HEADER_LENGTH || offset >= tableOffset) fail();
    return offset;
  }

  /** Ensures [start, start + length) lies in the object area, before the offset table. */
  private checkRange(start: number, length: number): void {
    if (length < 0 || start + length > this.trailer.tableOffset) fail();
  }

  /** Returns [count, first byte after the count] for a marker's low nibble. */
  private readCount(offset: number, info: number): [number, number] {
    if (info !== 0xf) return [info, offset + 1];
    this.checkRange(offset + 1, 1);
    const marker = this.view.getUint8(offset + 1);
    if (marker >> 4 !== 0x1 || (marker & 0xf) > 3) fail();
    const size = 1 << (marker & 0xf);
    this.checkRange(offset + 2, size);
    return [readUnsigned(this.view, offset + 2, size), offset + 2 + size];
  }

  private readRefs(start: number, count: number): number[] {
    const { refSize, objectCount } = this.trailer;
    this.checkRange(start, count * refSize);
    return Array.from({ length: count }, (_, index) => {
      const ref = readUnsigned(this.view, start + index * refSize, refSize);
      if (ref >= objectCount) fail();
      return ref;
    });
  }

  private readObject(ref: number, depth: number): PlistValue {
    this.budget.enter(depth);
    // Shared references are allowed (the budget bounds them); a reference back up the path is not.
    if (this.active.has(ref)) fail();
    this.active.add(ref);
    try {
      return this.readMarker(this.objectOffset(ref), depth);
    } finally {
      this.active.delete(ref);
    }
  }

  private readMarker(offset: number, depth: number): PlistValue {
    const marker = this.view.getUint8(offset);
    const info = marker & 0xf;
    switch (marker >> 4) {
      case 0x0:
        if (info === 0x8 || info === 0x9) return info === 0x9;
        return fail();
      case 0x1:
        return this.readInteger(offset, info);
      case 0x2:
        return this.readReal(offset, info);
      case 0x3:
        if (marker !== 0x33) fail();
        return new Date(APPLE_EPOCH_MS + (this.readReal(offset, 3) as number) * 1000);
      case 0x4:
        return this.readData(offset, info);
      case 0x5:
        return this.readAscii(offset, info);
      case 0x6:
        return this.readUtf16(offset, info);
      case 0xa:
        return this.readArray(offset, info, depth);
      case 0xd:
        return this.readDictionary(offset, info, depth);
      default:
        // UIDs, sets, and null/fill markers have no JSON-like meaning in a workflow.
        return fail();
    }
  }

  private readInteger(offset: number, info: number): number {
    if (info > 3) fail();
    const size = 1 << info;
    this.checkRange(offset + 1, size);
    // 8-byte integers are signed; smaller ones are unsigned.
    if (size === 8) {
      const value = this.view.getBigInt64(offset + 1);
      if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
        fail();
      return Number(value);
    }
    return readUnsigned(this.view, offset + 1, size);
  }

  private readReal(offset: number, info: number): number {
    if (info !== 2 && info !== 3) fail();
    this.checkRange(offset + 1, 1 << info);
    return info === 2 ? this.view.getFloat32(offset + 1) : this.view.getFloat64(offset + 1);
  }

  private readData(offset: number, info: number): Uint8Array {
    const [length, start] = this.readCount(offset, info);
    this.checkRange(start, length);
    this.budget.reserve(length);
    return this.bytes.slice(start, start + length);
  }

  private readAscii(offset: number, info: number): string {
    const [length, start] = this.readCount(offset, info);
    this.checkRange(start, length);
    this.budget.reserve(length);
    return decodeAscii(this.bytes.subarray(start, start + length));
  }

  private readUtf16(offset: number, info: number): string {
    const [length, start] = this.readCount(offset, info);
    this.checkRange(start, length * 2);
    this.budget.reserve(length * 2);
    return decodeUtf16(this.bytes.subarray(start, start + length * 2));
  }

  private readArray(offset: number, info: number, depth: number): PlistValue[] {
    const [count, start] = this.readCount(offset, info);
    return this.readRefs(start, count).map(ref => this.readObject(ref, depth + 1));
  }

  private readDictionary(offset: number, info: number, depth: number): PlistDictionary {
    const [count, start] = this.readCount(offset, info);
    const keyRefs = this.readRefs(start, count);
    const valueRefs = this.readRefs(start + count * this.trailer.refSize, count);
    const dictionary = createDictionary();
    keyRefs.forEach((keyRef, index) => {
      const key = this.readObject(keyRef, depth + 1);
      if (typeof key !== 'string') fail();
      dictionary[key] = this.readObject(valueRefs[index] as number, depth + 1);
    });
    return dictionary;
  }
}

/** Decodes a `bplist00` binary property list. Throws a content-free error on anything malformed. */
export function parseBinaryPlist(bytes: Uint8Array, budget = new DecodeBudget()): PlistValue {
  return new BinaryPlistReader(bytes, budget).read();
}
