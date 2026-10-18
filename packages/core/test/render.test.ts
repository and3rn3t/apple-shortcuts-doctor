import { describe, expect, it } from 'vitest';
import type { Report } from '../src/index.ts';
import { inspectWorkflow, renderMarkdown, renderReport, renderText } from '../src/index.ts';
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
