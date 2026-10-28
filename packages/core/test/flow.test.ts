import { describe, expect, it } from 'vitest';
import { inspectWorkflow, renderMarkdown, renderText, toReportV1 } from '../src/index.ts';
import type { Finding } from '../src/index.ts';
import { action, workflow } from './helpers.ts';

const output = (uuid: string): unknown => ({ Value: { Type: 'ActionOutput', OutputUUID: uuid } });
const variable = (name: string): unknown => ({ Value: { Type: 'Variable', VariableName: name } });
const clipboard = (uuid: string): unknown => action('getclipboard', { UUID: uuid });
const flows = (...actions: unknown[]): Finding[] =>
  inspectWorkflow(workflow(...actions)).findings.filter(f => f.code === 'possible-flow');

describe('source-to-sink paths', () => {
  it('reports a sensitive input that feeds an outbound action directly', () => {
    const [finding] = flows(clipboard('u1'), action('downloadurl', { WFInput: output('u1') }));
    expect(finding).toMatchObject({
      code: 'possible-flow',
      ruleId: 'sensitive-to-outbound',
      severity: 'warning',
      actions: [1, 2],
      paths: [{ actions: [1, 2], inferred: false }],
    });
  });

  it('follows variables: set from the source, read by the sink', () => {
    const [finding] = flows(
      clipboard('u1'),
      action('setvariable', { WFVariableName: 'x', WFInput: output('u1') }),
      action('text'),
      action('downloadurl', { WFInput: variable('x') })
    );
    expect(finding?.paths).toEqual([{ actions: [1, 2, 4], inferred: false }]);
    expect(finding?.actions).toEqual([1, 4]);
  });

  it('follows appends and a chain of explicit references', () => {
    const [finding] = flows(
      clipboard('u1'),
      action('gettext', { UUID: 'u2', WFInput: output('u1') }),
      action('appendvariable', { WFVariableName: 'x', WFInput: output('u2') }),
      action('downloadurl', { WFInput: variable('x') })
    );
    expect(finding?.paths).toEqual([{ actions: [1, 2, 3, 4], inferred: false }]);
  });

  it('marks a path that needs an inferred input step, and lowers it to review', () => {
    const [finding] = flows(
      clipboard('u1'),
      action('setvariable', { WFVariableName: 'x' }),
      action('downloadurl', { WFInput: variable('x') })
    );
    expect(finding).toMatchObject({
      severity: 'review',
      paths: [{ actions: [1, 2, 3], inferred: true }],
    });
  });

  it('prefers a path without inferred steps when both exist', () => {
    const [finding] = flows(
      clipboard('u1'),
      action('setvariable', { WFVariableName: 'x' }),
      action('downloadurl', { WFInput: { A: output('u1'), B: variable('x') } })
    );
    expect(finding).toMatchObject({
      severity: 'warning',
      paths: [{ actions: [1, 3], inferred: false }],
    });
  });

  it('reports nothing when the source and the sink are not connected', () => {
    expect(flows(clipboard('u1'), action('gettext'), action('downloadurl'))).toEqual([]);
  });

  it('does not connect through a variable that was set before the source', () => {
    expect(
      flows(
        action('setvariable', { WFVariableName: 'x', WFInput: {} }),
        clipboard('u1'),
        action('downloadurl', { WFInput: variable('x') })
      )
    ).toEqual([]);
  });

  it('reports an action that reads a sensitive input through a token and sends it', () => {
    const [finding] = flows(
      action('downloadurl', { WFHTTPBodyType: 'File', Body: { Value: { Type: 'Clipboard' } } })
    );
    expect(finding).toMatchObject({ actions: [1], paths: [{ actions: [1], inferred: false }] });
  });

  it('needs a sensitive source: ordinary text feeding an outbound action is not reported', () => {
    expect(
      flows(action('gettext', { UUID: 'u1' }), action('downloadurl', { WFInput: output('u1') }))
    ).toEqual([]);
  });

  it('does not treat an outbound action as a source for later ones', () => {
    expect(
      flows(action('downloadurl', { UUID: 'u1' }), action('downloadurl', { WFInput: output('u1') }))
    ).toEqual([]);
  });

  it('gives each outbound action its own finding', () => {
    const found = flows(
      clipboard('u1'),
      action('downloadurl', { WFInput: output('u1') }),
      action('downloadurl', { WFInput: output('u1') })
    );
    expect(found.map(f => f.actions)).toEqual([
      [1, 2],
      [1, 3],
    ]);
  });

  it('lists every source in the finding and the first ten paths', () => {
    const sources = Array.from({ length: 12 }, (_, i) => clipboard(`u${i}`));
    const inputs = Object.fromEntries(sources.map((_, i) => [`k${i}`, output(`u${i}`)]));
    const [finding] = flows(...sources, action('downloadurl', { WFInput: inputs }));
    expect(finding?.actions).toHaveLength(13);
    expect(finding?.paths).toHaveLength(10);
    expect(finding?.paths?.[0]?.actions).toEqual([1, 13]);
  });

  it('copies no value, name, or identifier into the finding', () => {
    const report = inspectWorkflow(
      workflow(
        action('getclipboard', { UUID: 'secret-uuid' }),
        action('setvariable', {
          WFVariableName: 'secret-variable',
          WFInput: output('secret-uuid'),
        }),
        action('downloadurl', {
          WFURL: 'https://secret.example/x',
          WFInput: variable('secret-variable'),
        })
      )
    );
    const finding = JSON.stringify(report.findings.filter(f => f.code === 'possible-flow'));
    expect(finding).not.toMatch(/secret/);
  });

  it('handles a long chain and wide fan-in within limits', () => {
    const chain = [clipboard('u0')];
    for (let i = 1; i < 1500; i++) {
      chain.push(action('gettext', { UUID: `u${i}`, WFInput: output(`u${i - 1}`) }));
    }
    chain.push(action('downloadurl', { WFInput: output('u1499') }));
    const [finding] = flows(...chain);
    expect(finding?.paths?.[0]?.actions).toHaveLength(1501);

    const appends = Array.from({ length: 900 }, () =>
      action('appendvariable', { WFVariableName: 'x', WFInput: output('u0') })
    );
    const wide = [clipboard('u0'), ...appends];
    for (let i = 0; i < 900; i++) wide.push(action('downloadurl', { WFInput: variable('x') }));
    const started = Date.now();
    expect(flows(...wide)).toHaveLength(900);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('is shown in text and Markdown as a possible path, and left out of the legacy shape', () => {
    const report = inspectWorkflow(
      workflow(
        clipboard('u1'),
        action('setvariable', { WFVariableName: 'x' }),
        action('downloadurl', { WFInput: variable('x') })
      )
    );
    const text = renderText(report);
    expect(text).toContain('possible path: #1 -> #2 -> #3 (includes an inferred step)');
    expect(renderMarkdown(report)).toContain('  - possible path: #1 -> #2 -> #3');
    const legacy = toReportV1(report);
    for (const finding of legacy.findings) expect(finding).not.toHaveProperty('paths');
  });
});
