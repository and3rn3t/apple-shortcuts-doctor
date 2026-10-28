import { describe, expect, it } from 'vitest';
import {
  CATALOG,
  IMPLICIT_INPUT_ACTIONS,
  inspectWorkflow,
  renderText,
  toReportV1,
} from '../src/index.ts';
import { ACTION_PREFIX } from '../src/rules.ts';
import { action, workflow } from './helpers.ts';

const control = (id: string, mode: number, group: string): unknown =>
  action(id, { GroupingIdentifier: group, WFControlFlowMode: mode });
const inferred = (...actions: unknown[]): (number | undefined)[] =>
  inspectWorkflow(workflow(...actions)).actions.map(a => a.inferredInputFrom);

describe('implicit previous-action input', () => {
  it('infers the previous action as the input when an input-taking action sets none', () => {
    expect(inferred(action('gettext'), action('setvariable', { WFVariableName: 'x' }))).toEqual([
      undefined,
      1,
    ]);
  });

  it('infers nothing when the action sets its own input, even an empty one', () => {
    expect(inferred(action('gettext'), action('setvariable', { WFInput: {} }))).toEqual([
      undefined,
      undefined,
    ]);
    expect(
      inferred(
        action('gettext', { UUID: 'u' }),
        action('math', { WFInput: { Value: { OutputUUID: 'u' } } })
      )
    ).toEqual([undefined, undefined]);
  });

  it('infers nothing for actions that do not take an input by default', () => {
    expect(inferred(action('gettext'), action('gettext'), action('downloadurl'))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('infers nothing for the first action, which has no previous one', () => {
    expect(inferred(action('setvariable', { WFVariableName: 'x' }))).toEqual([undefined]);
  });

  it('skips block markers and comments when finding the previous output', () => {
    expect(
      inferred(
        action('gettext'),
        control('conditional', 0, 'A'),
        action('comment'),
        action('math'),
        control('conditional', 2, 'A'),
        action('math')
      )
    ).toEqual([undefined, undefined, undefined, 1, undefined, 4]);
  });

  it('starts an Otherwise from what flowed into the If, not from the branch before it', () => {
    expect(
      inferred(
        action('gettext'),
        control('conditional', 0, 'A'),
        action('gettext'),
        control('conditional', 1, 'A'),
        action('setvariable', { WFVariableName: 'x' }),
        control('conditional', 2, 'A')
      )
    ).toEqual([undefined, undefined, undefined, undefined, 1, undefined]);
  });

  it('does the same for each menu item, and infers nothing when nothing flowed into the block', () => {
    expect(
      inferred(
        control('choosefrommenu', 0, 'M'),
        action('gettext'),
        control('choosefrommenu', 1, 'M'),
        action('math'),
        control('choosefrommenu', 1, 'M'),
        action('math'),
        control('choosefrommenu', 2, 'M')
      )
    ).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(
      inferred(
        action('gettext'),
        control('choosefrommenu', 0, 'M'),
        control('choosefrommenu', 1, 'M'),
        action('math'),
        control('choosefrommenu', 1, 'M'),
        action('math'),
        control('choosefrommenu', 2, 'M')
      )
    ).toEqual([undefined, undefined, undefined, 1, undefined, 1, undefined]);
  });

  it('handles nested blocks: an inner Otherwise returns to what flowed into the inner If', () => {
    expect(
      inferred(
        action('gettext'),
        control('conditional', 0, 'A'),
        action('gettext'),
        control('conditional', 0, 'B'),
        action('gettext'),
        control('conditional', 1, 'B'),
        action('math'),
        control('conditional', 2, 'B'),
        control('conditional', 1, 'A'),
        action('math'),
        control('conditional', 2, 'A')
      )
    ).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      3,
      undefined,
      undefined,
      1,
      undefined,
    ]);
  });

  it('chains: each input-taking action reads the one before it', () => {
    expect(
      inferred(action('gettext'), action('math'), action('round'), action('base64encode'))
    ).toEqual([undefined, 1, 2, 3]);
  });

  it('keeps the inferred edge apart from explicit and variable ones', () => {
    const report = inspectWorkflow(workflow(action('gettext', { UUID: 'u' }), action('math')));
    expect(report.actions[1]).toMatchObject({
      inferredInputFrom: 1,
      dependsOn: [],
      usesVariables: [],
    });
  });

  it('does not depend on the identifier of a third-party action', () => {
    expect(
      inferred(action('gettext'), {
        WFWorkflowActionIdentifier: 'com.vendor.App.Thing',
        WFWorkflowActionParameters: {},
      })
    ).toEqual([undefined, undefined]);
  });

  it('is shown as a possible edge in text output and is absent from the legacy shape', () => {
    const report = inspectWorkflow(workflow(action('gettext'), action('math')));
    expect(renderText(report)).toContain('2. math [basic] <? #1');
    expect(toReportV1(report).actions[1]).not.toHaveProperty('inferredInputFrom');
  });

  it('names only Apple actions, whether or not the rule catalog covers them yet', () => {
    expect(IMPLICIT_INPUT_ACTIONS.size).toBeGreaterThan(20);
    for (const id of IMPLICIT_INPUT_ACTIONS) expect(id.startsWith(ACTION_PREFIX), id).toBe(true);
    // The common ones are in the catalog; a gap here (documentpicker.save) is tracked in #44.
    const known = new Set(CATALOG.map(entry => `${ACTION_PREFIX}${entry.id}`));
    for (const id of ['setvariable', 'math', 'getvalueforkey', 'setclipboard']) {
      expect(known.has(`${ACTION_PREFIX}${id}`), id).toBe(true);
    }
  });
});
