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

  it('names signed .shortcut (AEA) containers and points to the export guide', () => {
    const convertPlist = vi.fn();
    const decode = (): unknown =>
      parseExport(bytes('AEA1signed-private-content'), { convertPlist });
    expect(decode).toThrow('Signed .shortcut files are not decoded');
    expect(decode).toThrow('"Getting an export"');
    expect(decode).not.toThrow('private-content');
    expect(convertPlist).not.toHaveBeenCalled();
  });

  it.each(['not an export', 'AEA0private', ''])(
    'rejects unsupported containers without invoking anything: %j',
    text => {
      const convertPlist = vi.fn();
      const decode = (): unknown => parseExport(bytes(text), { convertPlist });
      expect(decode).toThrow('Unsupported export');
      expect(decode).toThrow('"Getting an export"');
      expect(decode).not.toThrow('private');
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
    expect(() =>
      parseExport(bytes('<plist/>'), { plistUnavailableMessage: 'Fixed platform message.' })
    ).toThrow('Fixed platform message.');
  });

  it('replaces converter errors with a content-free message', () => {
    const convertPlist = vi.fn(() => {
      throw new Error('Unexpected value <string>private plist value</string>');
    });
    const decode = (): unknown => parseExport(bytes('<plist/>'), { convertPlist });
    expect(decode).toThrow('Cannot decode plist as JSON.');
    expect(decode).not.toThrow('private plist value');
  });

  it('limits input before decoding', () => {
    const convertPlist = vi.fn();
    expect(() => parseExport(new Uint8Array(MAX_BYTES + 1), { convertPlist })).toThrow('4 MiB');
    expect(convertPlist).not.toHaveBeenCalled();
  });
});
