// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_BYTES, parseExport } from '@shortcuts-doctor/core';
import { App } from '../src/App.tsx';
import { TOO_LARGE_MESSAGE } from '../src/inspect-file.ts';

// import.meta.url is not a file URL under jsdom, so resolve from the test file's directory.
const fixture = (name: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(readFileSync(join(import.meta.dirname, '../../../tests/fixtures', name)));

const fileOf = (parts: BlobPart[], name = 'export.shortcut'): File => new File(parts, name);

function chooseFile(file: File): void {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('No file input');
  fireEvent.change(input, { target: { files: [file] } });
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('inspector input', () => {
  it('offers a keyboard-reachable button that opens the file picker, and no form', () => {
    render(<App />);
    const button = screen.getByRole('button', { name: 'Choose a file' });
    expect(button).toHaveProperty('type', 'button');
    expect(button.tabIndex).toBe(0);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input?.hidden).toBe(true);
    const open = vi.spyOn(input as HTMLInputElement, 'click');
    fireEvent.click(button);
    expect(open).toHaveBeenCalledOnce();
    expect(document.querySelector('form')).toBeNull();
  });

  it.each([
    ['JSON', 'mixed-actions.json'],
    ['XML plist', 'mixed-actions.plist'],
    ['binary plist', 'mixed-actions.binary.plist'],
  ])('inspects a %s export chosen from the picker', async (_label, name) => {
    render(<App />);
    chooseFile(fileOf([fixture(name)], name));
    expect(await screen.findByTestId('summary')).toHaveProperty(
      'textContent',
      expect.stringContaining('Inspected 8 actions')
    );
  });

  it('inspects a file dropped on the drop zone and clears the highlight on drop', async () => {
    const { container } = render(<App />);
    const zone = container.querySelector('.dropzone') as HTMLElement;
    fireEvent.dragEnter(zone);
    fireEvent.dragOver(zone);
    expect(zone.className).toContain('dragging');
    fireEvent.drop(zone, {
      dataTransfer: { files: [fileOf([fixture('mixed-actions.json')], 'a.json')] },
    });
    expect(await screen.findByTestId('summary')).toBeTruthy();
    expect(zone.className).not.toContain('dragging');
  });

  it('keeps the highlight while a drag moves between the zone and its children', () => {
    const { container } = render(<App />);
    const zone = container.querySelector('.dropzone') as HTMLElement;
    const paragraph = zone.querySelector('p') as HTMLElement;
    const button = screen.getByRole('button', { name: 'Choose a file' });
    // Browsers fire dragenter on the element being entered before dragleave on the one being left.
    fireEvent.dragEnter(zone);
    fireEvent.dragEnter(paragraph);
    fireEvent.dragLeave(zone);
    expect(zone.className).toContain('dragging');
    fireEvent.dragEnter(button);
    fireEvent.dragLeave(paragraph);
    expect(zone.className).toContain('dragging');
    fireEvent.dragLeave(button);
    expect(zone.className).not.toContain('dragging');
  });

  it('forgets a cancelled drag, so the next one starts from a clean state', () => {
    const { container } = render(<App />);
    const zone = container.querySelector('.dropzone') as HTMLElement;
    fireEvent.dragEnter(zone);
    fireEvent.dragEnter(zone.querySelector('p') as HTMLElement);
    fireEvent.drop(zone, { dataTransfer: { files: [] } });
    expect(zone.className).not.toContain('dragging');
    fireEvent.dragEnter(zone);
    expect(zone.className).toContain('dragging');
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain('dragging');
  });

  it('stops the browser from navigating to a file dropped outside the drop zone', () => {
    render(<App />);
    const drop = new Event('drop', { cancelable: true });
    window.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    const over = new Event('dragover', { cancelable: true });
    window.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
  });

  it('inspects the built-in sample and shows its dependency and findings', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Try the built-in sample' }));
    expect(screen.getByTestId('summary').textContent).toContain('Inspected 3 actions');
    expect(screen.getByTestId('summary').textContent).toContain('2 findings');
  });

  it('shows the full report and moves focus to it once a file is inspected', async () => {
    render(<App />);
    expect(screen.queryByRole('heading', { name: 'Report' })).toBeNull();
    chooseFile(fileOf([fixture('mixed-actions.json')], 'a.json'));
    const heading = await screen.findByRole('heading', { name: 'Report' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(8);
    // A later error removes the stale report instead of leaving it beside the message.
    chooseFile(fileOf(['nope'], 'bad.json'));
    await screen.findByRole('alert');
    expect(screen.queryByRole('heading', { name: 'Report' })).toBeNull();
  });

  it('keeps only the newest result when an earlier, slower file finishes later', async () => {
    render(<App />);
    let finishSlow: (buffer: ArrayBuffer) => void = () => undefined;
    const slow = fileOf(['{"WFWorkflowActions":[]}'], 'slow.json');
    vi.spyOn(slow, 'arrayBuffer').mockReturnValue(
      new Promise<ArrayBuffer>(resolve => {
        finishSlow = resolve;
      })
    );
    chooseFile(slow);
    chooseFile(fileOf([fixture('mixed-actions.json')], 'fast.json'));
    expect(await screen.findByTestId('summary')).toHaveProperty(
      'textContent',
      expect.stringContaining('Inspected 8 actions')
    );
    finishSlow(new TextEncoder().encode('{"WFWorkflowActions":[]}').buffer as ArrayBuffer);
    await settle();
    expect(screen.getByTestId('summary').textContent).toContain('Inspected 8 actions');
  });
});

describe('iCloud link help', () => {
  it('explains why links are not opened and gives the download steps, with no field for a link', () => {
    render(<App />);
    const help = screen.getByText('Have an iCloud link instead?').closest('details');
    if (!help) throw new Error('No help section');
    expect(help.open).toBe(false);
    expect(within(help).getByText(/can’t open iCloud links, on purpose/)).toBeTruthy();
    expect(help.querySelector('pre')?.textContent).toContain(
      'https://www.icloud.com/shortcuts/api/records/<id>'
    );
    expect(help.querySelector('pre')?.textContent).toContain('"${f}"');
    expect(within(help).getByRole('link', { name: 'Getting an export' }).getAttribute('rel')).toBe(
      'noopener noreferrer'
    );
    // The page must never offer to fetch anything: no text, URL or search field.
    expect(document.querySelectorAll('input:not([type="file"]), textarea, form')).toHaveLength(0);
  });
});

describe('inspector errors', () => {
  it('refuses an oversized file before reading any of it', async () => {
    render(<App />);
    const big = fileOf(['x'], 'big.json');
    Object.defineProperty(big, 'size', { value: MAX_BYTES + 1 });
    const read = vi.spyOn(big, 'arrayBuffer');
    chooseFile(big);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(TOO_LARGE_MESSAGE);
    expect(read).not.toHaveBeenCalled();
  });

  it('uses the same text as core for the size limit', () => {
    expect(() => parseExport(new Uint8Array(MAX_BYTES + 1))).toThrow(TOO_LARGE_MESSAGE);
  });

  it('explains signed exports and links to the guide, without bypassing anything', async () => {
    render(<App />);
    chooseFile(fileOf([new TextEncoder().encode('AEA1 private signed payload')], 'my.shortcut'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Signed .shortcut files are not decoded');
    const link = within(alert).getByRole('link', { name: 'Getting an export' });
    expect(link.getAttribute('href')).toBe(
      'https://github.com/and3rn3t/apple-shortcuts-doctor#getting-an-export'
    );
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(document.body.innerHTML).not.toContain('private signed payload');
  });

  it('shows a fixed message for malformed input and never echoes its contents or name', async () => {
    render(<App />);
    chooseFile(fileOf(['{"private-key": "private-value", '], 'private-name.json'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Invalid JSON export.');
    expect(within(alert).queryByRole('link')).toBeNull();
    for (const secret of ['private-key', 'private-value', 'private-name']) {
      expect(document.body.innerHTML).not.toContain(secret);
    }
  });

  it('shows core’s validation message for JSON that is not a workflow', async () => {
    render(<App />);
    chooseFile(fileOf(['{"somethingElse": true}'], 'a.json'));
    expect((await screen.findByRole('alert')).textContent).toContain('WFWorkflowActions');
  });

  it('reports an unreadable file with a fixed message', async () => {
    render(<App />);
    const file = fileOf(['x'], 'broken.json');
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('private disk path /Users/me/x'));
    chooseFile(file);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Could not read that file.');
    expect(document.body.innerHTML).not.toContain('/Users/me');
  });

  it('clears an earlier error once a good file is chosen', async () => {
    render(<App />);
    chooseFile(fileOf(['nope'], 'bad.json'));
    await screen.findByRole('alert');
    chooseFile(fileOf([fixture('mixed-actions.json')], 'good.json'));
    expect(await screen.findByTestId('summary')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('inspector privacy', () => {
  const hostile = JSON.stringify({
    WFWorkflowActions: [
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.downloadurl',
        WFWorkflowActionParameters: {
          UUID: 'private-uuid-aaaa',
          WFURL: 'https://private.invalid/token-xyz',
          WFHTTPHeaders: { Authorization: 'Bearer private-secret-token' },
        },
      },
    ],
  });

  it('never renders parameter values, URLs, UUIDs, or the file name after a successful inspection', async () => {
    render(<App />);
    chooseFile(fileOf([hostile], 'private-shortcut-name.json'));
    await screen.findByTestId('summary');
    // innerHTML covers text, attributes, and hidden elements, not just visible text.
    const dom = document.body.innerHTML;
    for (const value of [
      'private.invalid',
      'token-xyz',
      'private-uuid-aaaa',
      'private-secret-token',
      'Authorization',
      'private-shortcut-name',
    ]) {
      expect(dom).not.toContain(value);
    }
  });

  it('never renders the built-in sample’s values either', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Try the built-in sample' }));
    const dom = document.body.innerHTML;
    for (const value of ['example.invalid', 'sample-uuid-one', 'sample-uuid-two', 'WFURL']) {
      expect(dom).not.toContain(value);
    }
  });

  it('makes no network request and writes no storage while inspecting', async () => {
    const fetchSpy = vi.fn();
    const xhrSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('XMLHttpRequest', xhrSpy);
    vi.stubGlobal('WebSocket', xhrSpy);
    vi.stubGlobal('indexedDB', { open: xhrSpy });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const beacon = vi.fn();
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    render(<App />);
    chooseFile(fileOf([hostile], 'a.json'));
    await screen.findByTestId('summary');
    chooseFile(fileOf(['AEA1 signed'], 'b.shortcut'));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Try the built-in sample' }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
