import { describe, expect, it, vi } from 'vitest';
import { MAX_BYTES, parseExport } from '../src/index.ts';
import { workflow } from './helpers.ts';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('export decoding', () => {
  it('accepts JSON with a BOM and whitespace without invoking a converter', () => {
    const convertPlist = vi.fn();
    const input = bytes(`\uFEFF \n${JSON.stringify(workflow())}`);
    expect(parseExport(input, { convertPlist })).toEqual(workflow());
    expect(convertPlist).not.toHaveBeenCalled();
  });

  it('redacts malformed JSON contents from errors', () => {
    expect(() => parseExport(bytes('{"private payload":'))).toThrow('Invalid JSON export.');
    expect(() => parseExport(bytes('{"private payload":'))).not.toThrow('private payload');
  });

  it.each(['AEA1signed-private-content', 'not an export', ''])(
    'rejects unsupported containers without invoking anything: %j',
    text => {
      const convertPlist = vi.fn();
      expect(() => parseExport(bytes(text), { convertPlist })).toThrow('Unsupported export');
      expect(convertPlist).not.toHaveBeenCalled();
    }
  );

  it.each(['<?xml version="1.0"?><plist/>', '<plist/>', 'bplist00content'])(
    'delegates recognized plist formats to the injected converter: %j',
    content => {
      const input = bytes(content);
      const convertPlist = vi.fn().mockReturnValue(workflow());
      expect(parseExport(input, { convertPlist })).toEqual(workflow());
      expect(convertPlist).toHaveBeenCalledWith(input);
    }
  );

  it('rejects plists when no converter is available', () => {
    expect(() => parseExport(bytes('<plist/>'))).toThrow('Supply a JSON workflow export');
  });

  it('limits input before decoding', () => {
    const convertPlist = vi.fn();
    expect(() => parseExport(new Uint8Array(MAX_BYTES + 1), { convertPlist })).toThrow('4 MiB');
    expect(convertPlist).not.toHaveBeenCalled();
  });
});
