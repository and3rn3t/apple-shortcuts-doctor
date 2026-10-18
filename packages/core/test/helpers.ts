export interface TestAction {
  WFWorkflowActionIdentifier: string;
  WFWorkflowActionParameters: unknown;
}

export const action = (id: string, parameters: unknown = {}): TestAction => ({
  WFWorkflowActionIdentifier: `is.workflow.actions.${id}`,
  WFWorkflowActionParameters: parameters,
});

export const workflow = (...actions: unknown[]): { WFWorkflowActions: unknown[] } => ({
  WFWorkflowActions: actions,
});
