import { describe, expect, it } from 'vitest';
import { inspectWorkflow } from '../src/index.ts';
import { action, workflow } from './helpers.ts';

const variable = (name: string): unknown => ({
  Value: { Type: 'Variable', VariableName: name },
  WFSerializationType: 'WFTextTokenAttachment',
});
const stringWith = (...names: string[]): unknown => ({
  Value: {
    string: '￼'.repeat(names.length),
    attachmentsByRange: Object.fromEntries(
      names.map((name, index) => [`{${index}, 1}`, { Type: 'Variable', VariableName: name }])
    ),
  },
  WFSerializationType: 'WFTextTokenString',
});
const magic = (type: string): unknown => ({
  Value: { Type: type },
  WFSerializationType: 'WFTextTokenAttachment',
});
const set = (name: string): unknown => action('setvariable', { WFVariableName: name });
const append = (name: string): unknown => action('appendvariable', { WFVariableName: name });

const uses = (...actions: unknown[]): number[][] =>
  inspectWorkflow(workflow(...actions)).actions.map(a => a.usesVariables);

describe('named variables', () => {
  it('links a read to the action that set the variable', () => {
    expect(uses(set('x'), action('gettext', { WFInput: variable('x') }))).toEqual([[], [1]]);
  });

  it('finds reads inside text with several tokens and inside nested parameters', () => {
    expect(
      uses(
        set('a'),
        set('b'),
        action('gettext', { WFTextActionText: stringWith('a', 'b') }),
        action('dictionary', { Items: [{ Key: 'k', Value: { Inner: variable('a') } }] })
      )
    ).toEqual([[], [], [1, 2], [1]]);
  });

  it('uses the most recent set, not an earlier one', () => {
    expect(uses(set('x'), set('x'), action('gettext', { WFInput: variable('x') }))[2]).toEqual([2]);
  });

  it('depends on a set and the appends that came after it', () => {
    expect(
      uses(set('x'), append('x'), append('x'), action('gettext', { WFInput: variable('x') }))[3]
    ).toEqual([1, 2, 3]);
  });

  it('forgets earlier appends when the variable is set again', () => {
    expect(
      uses(set('x'), append('x'), set('x'), action('gettext', { WFInput: variable('x') }))[3]
    ).toEqual([3]);
  });

  it('treats an append with no earlier set as defining the variable', () => {
    expect(uses(append('x'), action('gettext', { WFInput: variable('x') }))[1]).toEqual([1]);
  });

  it('reads before it defines, so a variable can be updated from itself', () => {
    expect(
      uses(set('x'), action('setvariable', { WFVariableName: 'x', WFInput: variable('x') }))[1]
    ).toEqual([1]);
  });

  it('keeps variables with different names apart, case-sensitively', () => {
    expect(uses(set('x'), action('gettext', { WFInput: variable('X') }))[1]).toEqual([]);
  });

  it('does not count a variable set later as a source', () => {
    const [report] = [
      inspectWorkflow(workflow(action('gettext', { WFInput: variable('x') }), set('x'))),
    ];
    expect(report?.actions[0]?.usesVariables).toEqual([]);
    expect(report?.actions[0]?.unresolvedVariableCount).toBe(1);
  });

  it('counts reads of variables never set, except the names Shortcuts provides', () => {
    const report = inspectWorkflow(
      workflow(
        action('gettext', { A: variable('nobody'), B: variable('nobody'), C: variable('other') }),
        action('gettext', {
          A: variable('Repeat Item'),
          B: variable('Repeat Index 2'),
          C: variable('Repeat Item 3'),
        })
      )
    );
    expect(report.actions.map(a => a.unresolvedVariableCount)).toEqual([2, 0]);
  });

  it('is not fooled by a variable name that looks like a built-in', () => {
    const report = inspectWorkflow(
      workflow(action('gettext', { A: variable('Repeat Item Evil') }))
    );
    expect(report.actions[0]?.unresolvedVariableCount).toBe(1);
  });

  it('ignores a set whose name is not a plain string', () => {
    expect(
      uses(
        action('setvariable', { WFVariableName: variable('y') }),
        action('gettext', { WFInput: variable('y') })
      )[1]
    ).toEqual([]);
  });

  it('does not treat other objects with a VariableName key as reads', () => {
    const report = inspectWorkflow(
      workflow(set('x'), action('gettext', { A: { VariableName: 'x' } }))
    );
    expect(report.actions[1]?.usesVariables).toEqual([]);
    expect(report.actions[1]?.unresolvedVariableCount).toBe(0);
  });

  it('keeps explicit output dependencies separate from variable ones', () => {
    const report = inspectWorkflow(
      workflow(
        action('gettext', { UUID: 'u1' }),
        set('x'),
        action('gettext', {
          A: variable('x'),
          B: { Value: { Type: 'ActionOutput', OutputUUID: 'u1' } },
        })
      )
    );
    expect(report.actions[2]).toMatchObject({ dependsOn: [1], usesVariables: [2] });
  });
});

describe('magic variable tokens', () => {
  const inputs = (type: string): string[] | undefined =>
    inspectWorkflow(workflow(action('gettext', { A: magic(type) }))).actions[0]?.magicInputs;

  it.each([
    ['ExtensionInput', 'shortcut-input'],
    ['Clipboard', 'clipboard'],
    ['Ask', 'ask'],
    ['CurrentDate', 'current-date'],
    ['DeviceDetails', 'device-details'],
  ])('names %s as %s', (type, name) => {
    expect(inputs(type)).toEqual([name]);
  });

  it('omits magicInputs when there are none, and for token types it does not know', () => {
    expect(inputs('Variable')).toBeUndefined();
    expect(inputs('Something New')).toBeUndefined();
    expect(inspectWorkflow(workflow(action('text'))).actions[0]).not.toHaveProperty('magicInputs');
  });

  it('lists each input once, in a fixed order', () => {
    const report = inspectWorkflow(
      workflow(action('gettext', { A: magic('Ask'), B: magic('Clipboard'), C: magic('Clipboard') }))
    );
    expect(report.actions[0]?.magicInputs).toEqual(['clipboard', 'ask']);
  });

  it('reports a clipboard token as a sensitive input, grouped with other clipboard-token uses', () => {
    const report = inspectWorkflow(
      workflow(
        action('gettext', { A: magic('Clipboard') }),
        action('gettext'),
        action('text', { B: magic('Clipboard') })
      )
    );
    const finding = report.findings.find(f => f.ruleId === 'clipboard-token');
    expect(finding).toMatchObject({ code: 'sensitive-input', severity: 'review', actions: [1, 3] });
  });

  it('reports device details but not Ask, current date, or Shortcut input', () => {
    const report = inspectWorkflow(
      workflow(
        action('gettext', { A: magic('DeviceDetails') }),
        action('gettext', { A: magic('Ask'), B: magic('CurrentDate'), C: magic('ExtensionInput') })
      )
    );
    expect(report.findings.map(f => [f.ruleId, f.actions])).toEqual([
      ['device-details-token', [1]],
    ]);
  });

  it('does not double-report an action that already reads the clipboard', () => {
    const report = inspectWorkflow(workflow(action('getclipboard')));
    expect(report.findings.map(f => f.ruleId)).toEqual(['getclipboard']);
  });
});

describe('variable names are opt-in', () => {
  const flow = workflow(
    set('Secret Token'),
    action('gettext', { A: variable('Secret Token'), B: variable('other') })
  );

  it('are never in the report by default', () => {
    const report = inspectWorkflow(flow);
    expect(JSON.stringify(report)).not.toContain('Secret Token');
    expect(JSON.stringify(report)).not.toContain('other');
    expect(report.actions[0]).not.toHaveProperty('variableNames');
  });

  it('are listed for the actions that set or read them when asked', () => {
    const report = inspectWorkflow(flow, { includeVariableNames: true });
    expect(report.actions.map(a => a.variableNames)).toEqual([
      ['Secret Token'],
      ['Secret Token', 'other'],
    ]);
  });

  it('are shown as printable text of limited length', () => {
    const name = `evil\u0007\n${'x'.repeat(200)}`;
    const report = inspectWorkflow(workflow(set(name)), { includeVariableNames: true });
    const shown = report.actions[0]?.variableNames?.[0] ?? '';
    expect(shown).toMatch(/^[\x20-\x7e]+$/);
    expect(shown.length).toBeLessThanOrEqual(63);
  });

  it('do not change anything else in the report', () => {
    const plain = inspectWorkflow(flow);
    const named = inspectWorkflow(flow, { includeVariableNames: true });
    const strip = (r: typeof plain): unknown =>
      JSON.parse(
        JSON.stringify(r, (key, value: unknown) => (key === 'variableNames' ? undefined : value))
      );
    expect(strip(named)).toEqual(strip(plain));
  });
});
