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
    ['deletefiles', 'destructive'],
    ['runworkflow', 'dependency'],
    ['getcurrentlocation', 'sensitive-input'],
    ['selectphotos', 'sensitive-input'],
    ['getlatestphotos', 'sensitive-input'],
    ['filter.contacts', 'sensitive-input'],
    ['getfile', 'sensitive-input'],
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
      workflow(action('runshellscript'), action('deletefiles'), action('openurl'))
    );
    expect(report.findings.map(f => f.severity)).toEqual(['warning', 'warning', 'review']);
  });

  it('marks unknown Apple and third-party actions rather than assuming safety', () => {
    const report = inspectWorkflow(
      workflow(action('futureaction'), {
        WFWorkflowActionIdentifier: 'com.example.app.intent',
      })
    );
    expect(report.actions.every(a => !a.recognized)).toBe(true);
    expect(report.actions.every(a => a.category === 'unknown')).toBe(true);
    expect(report.findings.every(f => f.code === 'unknown-action')).toBe(true);
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
