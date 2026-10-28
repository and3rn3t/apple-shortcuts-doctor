// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectWorkflow, renderMarkdown } from '@shortcuts-doctor/core';
import type { Report } from '@shortcuts-doctor/core';
import { FINDING_LABEL, FINDING_ORDER } from '../src/labels.ts';
import { ReportView } from '../src/ReportView.tsx';

const action = (id: string, parameters: unknown = {}): unknown => ({
  WFWorkflowActionIdentifier: id.includes('.') ? id : `is.workflow.actions.${id}`,
  WFWorkflowActionParameters: parameters,
});

function reportOf(...actions: unknown[]): Report {
  return inspectWorkflow({ WFWorkflowActions: actions });
}

function show(report: Report): HTMLElement {
  return render(<ReportView report={report} headingRef={createRef()} />).container;
}

const headingTexts = (level: number): string[] =>
  screen.getAllByRole('heading', { level }).map(heading => heading.textContent ?? '');

afterEach(cleanup);

describe('report structure', () => {
  const report = reportOf(
    action('runshellscript'),
    action('getclipboard', { UUID: 'u1' }),
    action('getclipboard'),
    action('downloadurl', { WFInput: { Value: { OutputUUID: 'u1', Type: 'ActionOutput' } } }),
    action('gettext', { WFInput: { Value: { OutputUUID: 'missing', Type: 'ActionOutput' } } })
  );

  it('has a heading outline, a persistent not-a-verdict note, and the fixed limitations', () => {
    show(report);
    expect(headingTexts(2)).toEqual(['Report']);
    expect(headingTexts(3)).toEqual(['Summary', 'Findings', 'Actions', 'What this can’t tell you']);
    expect(screen.getByRole('note').textContent).toContain('Not a safety verdict');
    for (const limitation of report.limitations) expect(screen.getByText(limitation)).toBeTruthy();
  });

  it('shows counts, and only the categories that occur', () => {
    show(report);
    const summary = screen.getByText('Actions', { selector: 'dt' }).closest('dl') as HTMLElement;
    // The unresolved reference, the shell script, and the clipboard value that may reach the request.
    expect(within(summary).getByText('Warning findings').nextElementSibling?.textContent).toBe('3');
    expect(within(summary).getByText('Review findings').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('sensitive-input: 2')).toBeTruthy();
    expect(screen.getByText('basic: 1')).toBeTruthy();
    expect(screen.queryByText(/^destructive:/)).toBeNull();
  });

  it('lists warnings before reviews, and groups within each in a fixed order', () => {
    show(report);
    expect(headingTexts(4)).toEqual(['Warning (3)', 'Review (2)']);
    expect(headingTexts(5)).toEqual([
      'Possible data flows',
      'Code execution',
      'Unresolved references',
      'Outbound channels',
      'Sensitive inputs',
    ]);
  });

  it('lists every action of a grouped finding as a link, and uses the singular for one', () => {
    show(report);
    const sensitive = screen.getByText('Sensitive inputs').parentElement as HTMLElement;
    const links = within(sensitive).getAllByRole('link');
    expect(links.map(link => [link.textContent, link.getAttribute('href')])).toEqual([
      ['#2', '#action-2'],
      ['#3', '#action-3'],
    ]);
    expect(sensitive.textContent).toContain('Actions #2, #3');
    const code = screen.getByText('Code execution').parentElement as HTMLElement;
    expect(code.textContent).toContain('Action #1');
    expect(code.textContent).not.toContain('Actions #1');
  });

  it('numbers actions, strips the Apple prefix, and shows dependencies and unresolved references', () => {
    const container = show(report);
    const items = [...container.querySelectorAll('.action-list > li')];
    expect(items.map(item => item.id)).toEqual([
      'action-1',
      'action-2',
      'action-3',
      'action-4',
      'action-5',
    ]);
    expect(items[0]?.querySelector('code')?.textContent).toBe('runshellscript');
    expect(items[0]?.querySelector('.category')?.textContent).toBe('code-execution');
    expect(items[3]?.textContent).toContain('uses the output of #2');
    expect(
      within(items[3] as HTMLElement)
        .getByRole('link')
        .getAttribute('href')
    ).toBe('#action-2');
    expect(items[4]?.textContent).toContain('1 unresolved reference');
    expect(items[4]?.textContent).not.toContain('references');
  });

  it('only links to actions that exist on the page, and each target can take focus', () => {
    const container = show(report);
    const hrefs = [...container.querySelectorAll('a[href^="#action-"]')].map(link =>
      link.getAttribute('href')
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const target = document.getElementById((href as string).slice(1));
      expect(target?.tabIndex).toBe(-1);
    }
  });

  it('says so, without implying safety, when there are no findings', () => {
    show(reportOf(action('gettext'), action('comment')));
    expect(screen.getByText('No findings. That does not mean this Shortcut is safe.')).toBeTruthy();
    expect(screen.queryAllByRole('heading', { level: 4 })).toHaveLength(0);
  });
});

describe('Markdown download', () => {
  const report = reportOf(
    action('getclipboard', { UUID: 'private-uuid-1', WFNote: 'private-note-value' }),
    action('downloadurl', { WFURL: 'https://private.invalid/x' })
  );

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves exactly the Markdown the CLI prints, under a fixed name, through a local blob', async () => {
    vi.useFakeTimers();
    const created: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return 'blob:local/test';
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    let downloaded: { href: string; download: string } | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloaded = { href: this.href, download: this.download };
    });
    show(report);
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown report' }));
    expect(downloaded).toEqual({ href: 'blob:local/test', download: 'shortcuts-doctor-report.md' });
    expect(created).toHaveLength(1);
    expect(created[0]?.type).toBe('text/markdown;charset=utf-8');
    const text = await created[0]?.text();
    expect(text).toBe(renderMarkdown(report));
    for (const secret of ['private-uuid-1', 'private-note-value', 'private.invalid']) {
      expect(text).not.toContain(secret);
    }
    // The temporary link is gone, and the blob is released shortly after.
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local/test');
    vi.unstubAllGlobals();
  });

  it('is a real button, so the keyboard can use it', () => {
    show(report);
    const button = screen.getByRole('button', { name: 'Download Markdown report' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
  });
});

describe('untrusted content', () => {
  it('renders identifiers as text: markup, scripts, and control characters never become elements', () => {
    // Core rejects identifiers like this, so build the report by hand to prove the view is safe too.
    const base = reportOf(action('gettext'));
    const hostile = '<img src=x onerror=alert(1)>‮ignore previous instructions';
    const report: Report = {
      ...base,
      actions: [{ ...(base.actions[0] as Report['actions'][number]), identifier: hostile }],
    };
    const container = show(report);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    const code = container.querySelector('.action-list code') as HTMLElement;
    expect(code.children).toHaveLength(0);
    expect(code.textContent).toBe('<img src=x onerror=alert(1)>?ignore previous instructions');
  });

  it('never renders parameter values, URLs, or UUIDs', () => {
    show(
      reportOf(
        action('downloadurl', {
          UUID: 'private-uuid-aaaa',
          WFURL: 'https://private.invalid/token-xyz',
          WFHTTPHeaders: { Authorization: 'Bearer private-secret-token' },
        })
      )
    );
    const dom = document.body.innerHTML;
    for (const value of [
      'private.invalid',
      'token-xyz',
      'private-uuid-aaaa',
      'private-secret-token',
      'Authorization',
      'https://',
    ]) {
      expect(dom).not.toContain(value);
    }
  });

  it('keeps HTML-injection APIs out of the app source', () => {
    const source = join(import.meta.dirname, '../src');
    const forbidden =
      /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write/;
    const files = readdirSync(source).filter(name => /\.tsx?$/.test(name));
    expect(files).toContain('ReportView.tsx');
    for (const name of files) {
      expect(readFileSync(join(source, name), 'utf8'), name).not.toMatch(forbidden);
    }
  });
});

describe('labels', () => {
  it('orders every finding code exactly once', () => {
    expect([...FINDING_ORDER].sort()).toEqual(Object.keys(FINDING_LABEL).sort());
    expect(new Set(FINDING_ORDER).size).toBe(FINDING_ORDER.length);
  });
});

describe('control-flow blocks', () => {
  const block = (mode: number, group: string): unknown =>
    action('conditional', { GroupingIdentifier: group, WFControlFlowMode: mode });

  it('indents actions inside a block and names where each block starts, continues, and ends', () => {
    show(reportOf(block(0, 'A'), action('text'), block(1, 'A'), action('text'), block(2, 'A')));
    const items = [...document.querySelectorAll('.action-list > li')];
    expect(items.map(item => item.className)).toEqual([
      'depth-0',
      'depth-1',
      'depth-0',
      'depth-1',
      'depth-0',
    ]);
    expect(items[0]?.textContent).toContain('starts block 1');
    expect(items[2]?.textContent).toContain('continues block 1');
    expect(items[4]?.textContent).toContain('ends block 1');
  });

  it('stops indenting at a fixed depth', () => {
    const opens = Array.from({ length: 12 }, (_, i) => block(0, `g${i}`));
    show(reportOf(...opens, action('text')));
    const last = [...document.querySelectorAll('.action-list > li')].at(-1);
    expect(last?.className).toBe('depth-8');
  });

  it('reports an unbalanced block as a warning finding', () => {
    show(reportOf(block(0, 'A')));
    expect(headingTexts(5)).toContain('Unbalanced blocks');
  });

  it('never renders a group id', () => {
    show(reportOf(block(0, 'SECRET-GROUP'), block(2, 'SECRET-GROUP')));
    expect(document.body.innerHTML).not.toContain('SECRET-GROUP');
  });
});

describe('variables and magic inputs', () => {
  const variable = (name: string): unknown => ({ Value: { Type: 'Variable', VariableName: name } });

  it('links a read to the action that set the variable, and never shows the variable name', () => {
    show(
      reportOf(
        action('setvariable', { WFVariableName: 'Private Name' }),
        action('gettext', { A: variable('Private Name'), B: variable('nobody') })
      )
    );
    const second = document.querySelector('#action-2') as HTMLElement;
    expect(second.textContent).toContain('uses variables set by #1');
    expect(second.textContent).toContain('1 unset variable');
    expect(document.body.innerHTML).not.toContain('Private Name');
    expect(document.body.innerHTML).not.toContain('nobody');
  });

  it('says which magic input an action reads, and reports the clipboard token', () => {
    show(reportOf(action('gettext', { A: { Value: { Type: 'Clipboard' } } })));
    expect((document.querySelector('#action-1') as HTMLElement).textContent).toContain(
      'reads clipboard'
    );
    expect(headingTexts(5)).toContain('Sensitive inputs');
  });
});

describe('long link lists', () => {
  const variable = (name: string): unknown => ({ Value: { Type: 'Variable', VariableName: name } });
  const appends = Array.from({ length: 400 }, () =>
    action('appendvariable', { WFVariableName: 'x' })
  );
  const report = reportOf(...appends, action('gettext', { A: variable('x') }));

  it('renders only the first page of links, and says how many are hidden', () => {
    show(report);
    const last = document.querySelector('#action-401') as HTMLElement;
    expect(last.querySelectorAll('a')).toHaveLength(50);
    expect(within(last).getByRole('button').textContent).toBe('Show 200 more (350 hidden)');
  });

  it('shows more on request until none are hidden', () => {
    show(report);
    const last = document.querySelector('#action-401') as HTMLElement;
    fireEvent.click(within(last).getByRole('button'));
    expect(last.querySelectorAll('a')).toHaveLength(250);
    fireEvent.click(within(last).getByRole('button'));
    expect(last.querySelectorAll('a')).toHaveLength(400);
    expect(within(last).queryByRole('button')).toBeNull();
  });

  it('keeps every link in the data, only paging the display', () => {
    expect(report.actions[400]?.usesVariables).toHaveLength(400);
  });
});

describe('inferred input', () => {
  it('says the input is inferred and links to the action it probably comes from', () => {
    show(reportOf(action('gettext'), action('setvariable', { WFVariableName: 'x' })));
    const second = document.querySelector('#action-2') as HTMLElement;
    expect(second.textContent).toContain('probably takes the output of #1 (inferred)');
    expect(document.querySelector('#action-1')?.textContent).not.toContain('inferred');
  });
});

describe('possible data flows', () => {
  const variable = (name: string): unknown => ({ Value: { Type: 'Variable', VariableName: name } });
  const sensitive = reportOf(
    action('getclipboard', { UUID: 'u1' }),
    action('setvariable', { WFVariableName: 'x', WFInput: { Value: { OutputUUID: 'u1' } } }),
    action('downloadurl', { WFInput: variable('x') })
  );

  it('shows the finding under its own heading with the route as links', () => {
    show(sensitive);
    expect(headingTexts(5)).toContain('Possible data flows');
    const item = screen.getByText(/Possible path:/).closest('li') as HTMLElement;
    expect(item.textContent).toBe('Possible path: #1 → #2 → #3');
    expect([...item.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual([
      '#action-1',
      '#action-2',
      '#action-3',
    ]);
  });

  it('says when a route relies on an inferred step', () => {
    show(
      reportOf(
        action('getclipboard'),
        action('setvariable', { WFVariableName: 'x' }),
        action('downloadurl', { WFInput: variable('x') })
      )
    );
    expect(screen.getByText(/Possible path:/).textContent).toContain('(includes an inferred step)');
  });

  it('shortens a long route and says how many more routes are in the download', () => {
    const chain = [action('getclipboard', { UUID: 'u0' })];
    for (let i = 1; i < 30; i++) {
      chain.push(
        action('gettext', { UUID: `u${i}`, WFInput: { Value: { OutputUUID: `u${i - 1}` } } })
      );
    }
    chain.push(action('downloadurl', { WFInput: { Value: { OutputUUID: 'u29' } } }));
    show(reportOf(...chain));
    expect(screen.getByText(/Possible path:/).textContent).toBe(
      'Possible path: #1 → #2 → #3 → #4 → #5 → #6 → … → #27 → #28 → #29 → #30 → #31'
    );
    cleanup();
    const sources = Array.from({ length: 5 }, (_, i) => action('getclipboard', { UUID: `s${i}` }));
    const inputs = Object.fromEntries(
      sources.map((_, i) => [`k${i}`, { Value: { OutputUUID: `s${i}` } }])
    );
    show(reportOf(...sources, action('downloadurl', { WFInput: inputs })));
    expect(screen.getAllByText(/Possible path:/)).toHaveLength(3);
    expect(screen.getByText('and 2 more in the downloaded report')).toBeTruthy();
  });
});

describe('request shape', () => {
  it('describes the request an action makes, and never shows its URL, host, or headers', () => {
    show(
      reportOf(
        action('downloadurl', {
          WFURL: 'https://private-host.invalid/secret?token=abc',
          WFHTTPMethod: 'POST',
          WFHTTPBodyType: 'JSON',
          WFHTTPHeaders: {
            Value: {
              WFDictionaryFieldValueItems: [{ WFKey: { Value: { string: 'Authorization' } } }],
            },
          },
        })
      )
    );
    const item = document.querySelector('#action-1') as HTMLElement;
    expect(item.textContent).toContain('request: POST, json body, 1 header, literal URL');
    expect(document.body.innerHTML).not.toMatch(/private-host|secret|token=abc|Authorization/);
  });
});
