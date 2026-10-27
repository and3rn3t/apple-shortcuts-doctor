import { inspectWorkflow, parseExport } from '@shortcuts-doctor/core';
import type { Report } from '@shortcuts-doctor/core';

const SAMPLE_WORKFLOW = JSON.stringify({
  WFWorkflowName: 'Sample',
  WFWorkflowActions: [
    {
      WFWorkflowActionIdentifier: 'is.workflow.actions.getclipboard',
      WFWorkflowActionParameters: { UUID: 'A1' },
    },
    {
      WFWorkflowActionIdentifier: 'is.workflow.actions.downloadurl',
      WFWorkflowActionParameters: { UUID: 'A2', WFURL: 'https://example.invalid/sample' },
    },
    { WFWorkflowActionIdentifier: 'is.workflow.actions.showresult' },
  ],
});

function inspectSample(): Report {
  return inspectWorkflow(parseExport(new TextEncoder().encode(SAMPLE_WORKFLOW)));
}

export function App(): React.JSX.Element {
  const report = inspectSample();
  return (
    <main>
      <h1>Shortcuts Doctor</h1>
      <p>
        Static inspection of Apple Shortcut exports. Everything runs in your browser; nothing is
        uploaded.
      </p>
      <p data-testid="action-count">
        Built-in sample: {report.actionCount} actions, {report.findings.length} findings.
      </p>
    </main>
  );
}
