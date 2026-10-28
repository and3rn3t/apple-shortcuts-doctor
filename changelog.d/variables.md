### Added

- Named variables and magic-variable tokens (#39). Reads of a named variable are linked to the
  `setvariable`/`appendvariable` actions that last set it (and the appends since): each action has
  `usesVariables` (action numbers), `unresolvedVariableCount` (reads of variables nothing set,
  excluding Shortcuts' own Repeat Item / Repeat Index), and, when it reads one, `magicInputs`
  (`shortcut-input`, `clipboard`, `ask`, `current-date`, `device-details`). Text and Markdown show
  `<~ #3, #6` for variable links; the web report says "uses variables set by".
- Two new `sensitive-input` rules for tokens that read data without an action: `clipboard-token`
  and `device-details-token`.
- Variable names are opt-in: `--show-variable-names` on the CLI or `includeVariableNames` in
  `inspectWorkflow` adds `variableNames` (printable ASCII, 60 characters at most). By default no
  name is in the report. Report format 2 stays at version 2; the new fields are additive.
- Checked on 138 real exports: 9,009 variable links, unset reads down from 902 to 168 once the
  built-in repeat names are excluded, no failures.

### Changed

- The variables limitation now says they are linked by name to the closest earlier set or append,
  ignoring branches and loops.
