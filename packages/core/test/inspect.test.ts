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
    expect(report.findings.map(f => f.code)).toEqual([
      'sensitive-input',
      'possible-flow',
      'outbound',
    ]);
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

describe('control-flow structure', () => {
  const block = (id: string, mode: number, group: string | undefined): ReturnType<typeof action> =>
    action(
      id,
      group === undefined
        ? { WFControlFlowMode: mode }
        : { GroupingIdentifier: group, WFControlFlowMode: mode }
    );
  const structure = (...actions: unknown[]) => {
    const report = inspectWorkflow(workflow(...actions));
    return {
      depths: report.actions.map(a => a.depth),
      flows: report.actions.map(a => (a.flow ? `${a.flow.block}:${a.flow.role}` : '-')),
      unbalanced: report.findings.find(f => f.code === 'unbalanced-control-flow')?.actions ?? [],
      report,
    };
  };

  it('has depth 0 and no flow on a workflow without blocks', () => {
    const { depths, flows, unbalanced } = structure(action('text'), action('count'));
    expect(depths).toEqual([0, 0]);
    expect(flows).toEqual(['-', '-']);
    expect(unbalanced).toEqual([]);
  });

  it('nests the actions of an if / else block one level deep', () => {
    const { depths, flows, unbalanced } = structure(
      block('conditional', 0, 'G1'),
      action('text'),
      block('conditional', 1, 'G1'),
      action('text'),
      block('conditional', 2, 'G1'),
      action('text')
    );
    expect(depths).toEqual([0, 1, 0, 1, 0, 0]);
    expect(flows).toEqual(['1:start', '-', '1:middle', '-', '1:end', '-']);
    expect(unbalanced).toEqual([]);
  });

  it('numbers blocks in start order and nests repeat inside menu inside if', () => {
    const { depths, flows, unbalanced } = structure(
      block('conditional', 0, 'A'),
      block('choosefrommenu', 0, 'B'),
      block('choosefrommenu', 1, 'B'),
      block('repeat.count', 0, 'C'),
      action('text'),
      block('repeat.count', 2, 'C'),
      block('choosefrommenu', 2, 'B'),
      block('conditional', 2, 'A')
    );
    expect(depths).toEqual([0, 1, 1, 2, 3, 2, 1, 0]);
    expect(flows).toEqual([
      '1:start',
      '2:start',
      '2:middle',
      '3:start',
      '-',
      '3:end',
      '2:end',
      '1:end',
    ]);
    expect(unbalanced).toEqual([]);
  });

  it('reads the structure from the parameters, not from the action identifier', () => {
    const { flows } = structure(
      {
        WFWorkflowActionIdentifier: 'com.vendor.App.Thing',
        WFWorkflowActionParameters: { GroupingIdentifier: 'X', WFControlFlowMode: 0 },
      },
      block('anything', 2, 'X')
    );
    expect(flows).toEqual(['1:start', '1:end']);
  });

  it.each([
    ['a start with no end', [block('conditional', 0, 'A'), action('text')], [1]],
    ['an end with no start', [action('text'), block('conditional', 2, 'A')], [2]],
    ['an else with no start', [block('conditional', 1, 'A')], [1]],
    [
      'an end that closes an outer block, leaving the inner one open',
      [block('conditional', 0, 'A'), block('repeat.count', 0, 'B'), block('conditional', 2, 'A')],
      [2],
    ],
    [
      'an else that belongs to an outer block (and the inner end that then has no start)',
      [
        block('conditional', 0, 'A'),
        block('repeat.count', 0, 'B'),
        block('conditional', 1, 'A'),
        block('repeat.count', 2, 'B'),
        block('conditional', 2, 'A'),
      ],
      [2, 4],
    ],
    [
      'a group id reused by a second start',
      [
        block('conditional', 0, 'A'),
        block('conditional', 2, 'A'),
        block('conditional', 0, 'A'),
        block('conditional', 2, 'A'),
      ],
      [3],
    ],
    ['a mode that is not 0, 1, or 2', [block('conditional', 7, 'A')], [1]],
    [
      'a mode that is not a number',
      [action('conditional', { GroupingIdentifier: 'A', WFControlFlowMode: '0' })],
      [1],
    ],
    ['a block action with no group id', [block('conditional', 0, undefined)], [1]],
    [
      'a grouped action with no mode, between a start and its end',
      [
        block('conditional', 0, 'A'),
        action('conditional', { GroupingIdentifier: 'A' }),
        block('conditional', 2, 'A'),
      ],
      [2],
    ],
    ['an empty group id', [block('conditional', 0, '')], [1]],
  ] as [string, unknown[], number[]][])('flags %s', (_label, actions, expected) => {
    const { unbalanced, report } = structure(...actions);
    expect(unbalanced).toEqual(expected);
    expect(report.findings.find(f => f.code === 'unbalanced-control-flow')?.severity).toBe(
      'warning'
    );
  });

  it('keeps depths non-negative and finite even when everything is unbalanced', () => {
    const { depths } = structure(
      block('conditional', 2, 'A'),
      block('conditional', 2, 'B'),
      block('conditional', 1, 'C')
    );
    expect(depths).toEqual([0, 0, 0]);
  });

  it('groups several unbalanced actions into one finding', () => {
    const { report } = structure(block('conditional', 0, 'A'), block('conditional', 0, 'B'));
    expect(report.findings.filter(f => f.code === 'unbalanced-control-flow')).toHaveLength(1);
    expect(report.findings[0]?.actions).toEqual([1, 2]);
  });

  it('never copies a group id into the report', () => {
    const { report } = structure(
      block('conditional', 0, 'SECRET-GROUP-ID'),
      block('conditional', 2, 'OTHER-SECRET-GROUP')
    );
    const text = JSON.stringify(report);
    expect(text).not.toContain('SECRET-GROUP-ID');
    expect(text).not.toContain('OTHER-SECRET-GROUP');
  });

  it('handles 500 nested blocks', () => {
    const open = Array.from({ length: 500 }, (_, i) => block('conditional', 0, `g${i}`));
    const close = Array.from({ length: 500 }, (_, i) => block('conditional', 2, `g${499 - i}`));
    const { depths, unbalanced } = structure(...open, action('text'), ...close);
    expect(Math.max(...depths)).toBe(500);
    expect(unbalanced).toEqual([]);
  });
});
