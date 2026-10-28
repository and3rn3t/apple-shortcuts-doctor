### Added

- Implicit input edges (#40). An action that normally takes the previous action's output but sets
  no `WFInput` of its own now has `inferredInputFrom` (an action number), shown as `<? #3` in text
  and Markdown and as "probably takes the output of #3 (inferred)" in the web report. It is a
  separate field from `dependsOn` (explicit references) and `usesVariables`, so an inference is
  never mistaken for a stated link. It applies to a short, evidence-based list of Apple actions
  (each has an explicit `WFInput` in at least 85% of its uses in 138 real exports), skips block
  markers and comments when finding the previous action, and gives the first action none.
  Checked on those exports: 244 inferred edges (207 on `setvariable`), no failures.
