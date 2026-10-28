import { describe, expect, it } from 'vitest';
import type { Report } from '../src/index.ts';
import {
  displayIdentifier,
  inspectWorkflow,
  renderMarkdown,
  renderReport,
  renderText,
} from '../src/index.ts';
import { action, workflow } from './helpers.ts';

const report = inspectWorkflow(
  workflow(
    action('getclipboard', { UUID: 'secret-uuid-1', WFNote: 'fake-parameter-value' }),
    action('downloadurl', {
      WFURL: 'https://example.invalid/x',
      Input: { OutputUUID: 'secret-uuid-1' },
    }),
    { WFWorkflowActionIdentifier: 'com.vendor.App.Unknown' }
  )
);

describe('displayIdentifier', () => {
  it('drops the Apple prefix, keeps other identifiers whole, and masks non-printable characters', () => {
    expect(displayIdentifier('is.workflow.actions.getclipboard')).toBe('getclipboard');
    expect(displayIdentifier('com.example.app.intent')).toBe('com.example.app.intent');
    expect(displayIdentifier('a\u202eb\u0000c\nd')).toBe('a?b?c?d');
  });
});

describe('renderers', () => {
  it('renders text with actions, findings, and limitations', () => {
    const text = renderText(report);
    expect(text).toContain('3 action(s)');
    expect(text).toContain('2. downloadurl [outbound] <- #1');
    expect(text).toContain('REVIEW sensitive-input (#1)');
    expect(text).toContain('Limitations');
  });

  it('renders markdown with headings', () => {
    const md = renderMarkdown(report);
    expect(md).toContain('## Findings');
    expect(md).toContain('2. `downloadurl` [outbound] <- #1');
  });

  it('does not leak parameter values or UUIDs', () => {
    for (const out of [renderText(report), renderMarkdown(report)]) {
      expect(out).not.toContain('fake-parameter-value');
      expect(out).not.toContain('secret-uuid');
      expect(out).not.toContain('example.invalid');
    }
  });

  it('sanitizes identifiers even if validation is bypassed', () => {
    const hostile: Report = {
      ...report,
      actions: [{ ...report.actions[0]!, identifier: 'x\u001b[31m`y' }],
    };
    expect(renderText(hostile)).not.toContain('\u001b');
    expect(renderMarkdown(hostile)).toContain("`x?[31m'y`");
  });

  it('renderReport emits JSON for json', () => {
    expect(JSON.parse(renderReport(report, 'json')).formatVersion).toBe(2);
  });
});

describe('nested blocks in the renderers', () => {
  const block = (mode: number, group: string): ReturnType<typeof action> =>
    action('conditional', { GroupingIdentifier: group, WFControlFlowMode: mode });
  const nested = inspectWorkflow(
    workflow(block(0, 'A'), action('text'), block(1, 'A'), block(2, 'A'))
  );

  it('indents text output under its block and labels the block roles', () => {
    const lines = renderText(nested).split('\n');
    expect(lines).toContain('1. conditional [basic] {block 1 start}');
    expect(lines).toContain('  2. text [basic]');
    expect(lines).toContain('3. conditional [basic] {block 1 else/item}');
    expect(lines).toContain('4. conditional [basic] {block 1 end}');
  });

  it('indents markdown by three spaces per level so it nests as a list', () => {
    expect(renderMarkdown(nested).split('\n')).toContain('   2. `text` [basic]');
  });

  it('stops indenting at ten levels', () => {
    const open = Array.from({ length: 14 }, (_, i) => block(0, `g${i}`));
    const lines = renderText(inspectWorkflow(workflow(...open, action('text')))).split('\n');
    const text = lines.find(line => line.includes('. text'));
    expect(text?.search(/\S/)).toBe(20);
  });
});
