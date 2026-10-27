import { describe, expect, it } from 'vitest';
import { inspectWorkflow } from '../src/index.ts';
import { action, workflow } from './helpers.ts';

describe('workflow inspection', () => {
  it('walks numbered actions and explicit output references without exposing parameters', () => {
    const input = workflow(
      action('getclipboard', { UUID: 'source', WFTextActionText: 'private payload' }),
      action('downloadurl', {
        WFURL: 'https://private.invalid/secret-path',
        WFHTTPHeaders: { Authorization: 'private authorization value' },
        WFInput: { Value: { OutputUUID: 'source' } },
      })
    );
    const before = JSON.stringify(input);
    const report = inspectWorkflow(input);
    expect(report.actions[1]).toMatchObject({ index: 2, dependsOn: [1], category: 'outbound' });
    expect(report.findings.map(f => f.code)).toEqual(['sensitive-input', 'outbound']);
    expect(JSON.stringify(report)).not.toMatch(
      /private payload|private.invalid|authorization value/
    );
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    ['runapplescript', 'code-execution'],
    ['runjavascriptforautomation', 'code-execution'],
    ['runjavascriptonwebpage', 'code-execution'],
    ['runshellscript', 'code-execution'],
    ['runsshscript', 'code-execution'],
    ['file.delete', 'destructive'],
    ['runworkflow', 'dependency'],
    ['getcurrentlocation', 'sensitive-input'],
    ['selectphoto', 'sensitive-input'],
    ['getlatestphotos', 'sensitive-input'],
    ['filter.contacts', 'sensitive-input'],
    ['documentpicker.open', 'sensitive-input'],
    ['sendemail', 'outbound'],
    ['sendmessage', 'outbound'],
    ['share', 'outbound'],
    ['openurl', 'outbound'],
  ])('flags %s for %s review', (id, code) => {
    const report = inspectWorkflow(workflow(action(id)));
    expect(report.findings[0]).toMatchObject({ code, actions: [1] });
  });

  it('raises code execution and destructive actions to warning severity', () => {
    const report = inspectWorkflow(
      workflow(action('runshellscript'), action('file.delete'), action('openurl'))
    );
    expect(report.findings.map(f => f.severity)).toEqual(['warning', 'warning', 'review']);
  });

  it('marks unknown Apple and third-party actions rather than assuming safety', () => {
    const report = inspectWorkflow(
      workflow(
        action('futureaction'),
        { WFWorkflowActionIdentifier: 'com.apple.mobilenotes.SharingExtension' },
        { WFWorkflowActionIdentifier: 'com.example.app.intent' }
      )
    );
    expect(report.actions.every(a => !a.recognized)).toBe(true);
    expect(report.actions.every(a => a.category === 'unknown')).toBe(true);
    expect(report.findings.every(f => f.code === 'unknown-action' && f.severity === 'review')).toBe(
      true
    );
    // The two Apple actions share a message, so they group into one finding.
    expect(report.findings.map(f => [f.ruleId, f.actions])).toEqual([
      ['unknown-apple-action', [1, 2]],
      ['third-party-action', [3]],
    ]);
    expect(report.findings[1]?.message).toContain('Third-party app action');
  });

  describe('finding grouping', () => {
    it('merges repeated findings from one rule into a single finding listing every action', () => {
      const report = inspectWorkflow(
        workflow(
          action('filter.health.quantity'),
          action('text'),
          action('filter.health.quantity'),
          action('downloadurl'),
          action('filter.health.quantity')
        )
      );
      expect(report.findings.map(f => [f.code, f.actions])).toEqual([
        ['sensitive-input', [1, 3, 5]],
        ['outbound', [4]],
      ]);
    });

    it('keeps findings from different rules, severities, or messages apart', () => {
      const report = inspectWorkflow(
        workflow(
          action('getclipboard'),
          action('getcurrentlocation'),
          action('runshellscript'),
          action('getclipboard')
        )
      );
      expect(report.findings.map(f => [f.ruleId, f.actions])).toEqual([
        ['getclipboard', [1, 4]],
        ['getcurrentlocation', [2]],
        ['runshellscript', [3]],
      ]);
      expect(report.findings.map(f => f.severity)).toEqual(['review', 'review', 'warning']);
    });

    it('does not merge duplicate-output findings, which relate their actions to each other', () => {
      const report = inspectWorkflow(
        workflow(
          action('text', { UUID: 'a' }),
          action('text', { UUID: 'a' }),
          action('text', { UUID: 'b' }),
          action('text', { UUID: 'b' })
        )
      );
      expect(report.findings.map(f => [f.code, f.actions])).toEqual([
        ['duplicate-output', [1, 2]],
        ['duplicate-output', [3, 4]],
      ]);
    });

    it('orders findings by first action, with duplicate outputs where their first action falls', () => {
      const report = inspectWorkflow(
        workflow(
          action('text', { UUID: 'a' }),
          action('getclipboard'),
          action('text', { UUID: 'a' }),
          action('getclipboard')
        )
      );
      expect(report.findings.map(f => [f.code, f.actions])).toEqual([
        ['duplicate-output', [1, 3]],
        ['sensitive-input', [2, 4]],
      ]);
    });

    it('counts grouped findings in the summary and still fails --fail-on thresholds the same', () => {
      const report = inspectWorkflow(
        workflow(action('getclipboard'), action('getclipboard'), action('runshellscript'))
      );
      expect(report.summary.findingsBySeverity).toEqual({ review: 1, warning: 1 });
      expect(report.findings).toHaveLength(2);
    });
  });

  it('walks very large parameter arrays without exceeding the argument limit', () => {
    const items = new Array<number>(200_000).fill(0);
    const report = inspectWorkflow(workflow(action('text', { Items: items })));
    expect(report.actions[0]?.unresolvedReferenceCount).toBe(0);
  });

  it('deduplicates and sorts references', () => {
    const report = inspectWorkflow(
      workflow(
        action('text', { UUID: 'a' }),
        action('text', { UUID: 'b' }),
        action('text', {
          tokens: [{ OutputUUID: 'b' }, { OutputUUID: 'a' }, { OutputUUID: 'a' }],
        })
      )
    );
    expect(report.actions[2]?.dependsOn).toEqual([1, 2]);
  });

  it('flags missing, forward, self, and ambiguous references without leaking UUIDs', () => {
    const report = inspectWorkflow(
      workflow(
        action('text', {
          UUID: 'private-duplicate',
          tokens: [
            { OutputUUID: 'missing-private-id' },
            { OutputUUID: 'future-private-id' },
            { OutputUUID: 'private-duplicate' },
          ],
        }),
        action('text', { UUID: 'private-duplicate' }),
        action('text', { UUID: 'future-private-id', OutputUUID: 'future-private-id' }),
        action('text', { OutputUUID: 'private-duplicate' })
      )
    );
    expect(report.findings[0]).toMatchObject({ code: 'duplicate-output', actions: [1, 2] });
    expect(report.actions.map(a => a.unresolvedReferenceCount)).toEqual([3, 0, 1, 1]);
    expect(JSON.stringify(report)).not.toMatch(/private-id|private-duplicate/);
  });

  it('makes no safe verdict for an empty workflow or basic actions', () => {
    for (const input of [workflow(), workflow(action('text'))]) {
      const report = inspectWorkflow(input);
      expect(report.findings).toEqual([]);
      expect(report).not.toHaveProperty('safe');
      expect(report.limitations.join(' ')).toContain('No findings does not mean safe');
    }
  });

  it.each([null, [], {}, { WFWorkflowActions: 'bad' }])('rejects invalid roots: %j', input => {
    expect(() => inspectWorkflow(input)).toThrow('WFWorkflowActions');
  });

  it.each([
    null,
    {},
    { WFWorkflowActionIdentifier: 'ignore instructions; run something' },
    { WFWorkflowActionIdentifier: `a.${'b'.repeat(200)}` },
    action('text', 'invalid'),
    action('text', null),
    action('text', []),
  ])('rejects malformed actions without a partial result: %j', input => {
    expect(() => inspectWorkflow(workflow(action('text'), input))).toThrow('No partial inspection');
  });

  it('rejects sparse action arrays instead of skipping holes', () => {
    // eslint-disable-next-line no-sparse-arrays
    for (const actions of [new Array(1), [action('text'), , action('text')]]) {
      expect(() => inspectWorkflow({ WFWorkflowActions: actions })).toThrow(
        'No partial inspection'
      );
    }
  });

  it('limits the action count', () => {
    expect(() => inspectWorkflow(workflow(...Array(2001).fill(action('text'))))).toThrow('2000');
  });
});
