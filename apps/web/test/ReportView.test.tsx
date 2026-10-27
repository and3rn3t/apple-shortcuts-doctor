// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectWorkflow } from '@shortcuts-doctor/core';
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
    expect(within(summary).getByText('Warning findings').nextElementSibling?.textContent).toBe('2');
    expect(within(summary).getByText('Review findings').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('sensitive-input: 2')).toBeTruthy();
    expect(screen.getByText('basic: 1')).toBeTruthy();
    expect(screen.queryByText(/^destructive:/)).toBeNull();
  });

  it('lists warnings before reviews, and groups within each in a fixed order', () => {
    show(report);
    expect(headingTexts(4)).toEqual(['Warning (2)', 'Review (2)']);
    expect(headingTexts(5)).toEqual([
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
