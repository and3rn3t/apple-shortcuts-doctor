const SAMPLE_WORKFLOW = JSON.stringify({
  WFWorkflowName: 'Sample',
  WFWorkflowActions: [
    {
      WFWorkflowActionIdentifier: 'is.workflow.actions.getclipboard',
      WFWorkflowActionParameters: { UUID: 'sample-uuid-one' },
    },
    {
      WFWorkflowActionIdentifier: 'is.workflow.actions.downloadurl',
      WFWorkflowActionParameters: {
        UUID: 'sample-uuid-two',
        WFURL: 'https://example.invalid/sample',
        WFInput: { Value: { OutputUUID: 'sample-uuid-one', Type: 'ActionOutput' } },
      },
    },
    { WFWorkflowActionIdentifier: 'is.workflow.actions.showresult' },
  ],
});

/** A small export built into the page, so the inspector can be tried without a file. */
export const SAMPLE_EXPORT: Uint8Array = new TextEncoder().encode(SAMPLE_WORKFLOW);
