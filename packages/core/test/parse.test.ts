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

  it('decodes plists with the built-in decoder by default', () => {
    const xml = '<plist><dict><key>WFWorkflowActions</key><array/></dict></plist>';
    expect(parseExport(bytes(xml))).toEqual(workflow());
  });

  it('replaces built-in decoder errors with a content-free message', () => {
    const decode = (): unknown => parseExport(bytes('<plist><string>private value</plist>'));
    expect(decode).toThrow('Cannot decode plist.');
    expect(decode).not.toThrow('private value');
  });

  it('replaces converter errors with a content-free message', () => {
    const convertPlist = vi.fn(() => {
      throw new Error('Unexpected value <string>private plist value</string>');
    });
    const decode = (): unknown => parseExport(bytes('<plist/>'), { convertPlist });
    expect(decode).toThrow('Cannot decode plist.');
    expect(decode).not.toThrow('private plist value');
  });

  it('limits input before decoding', () => {
    const convertPlist = vi.fn();
    expect(() => parseExport(new Uint8Array(MAX_BYTES + 1), { convertPlist })).toThrow('4 MiB');
    expect(convertPlist).not.toHaveBeenCalled();
  });
});
