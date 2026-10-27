### Added

- The web app shows the full report for an inspected export: a summary, findings grouped by
  severity and kind (each grouped finding lists every action it covers as links), the numbered
  actions with links to the actions they use, an "unresolved reference" count, core's limitations,
  and a persistent note that the report is not a safety verdict. Identifiers are rendered as
  text only, and focus moves to the report when it appears (#35).
- `@shortcuts-doctor/core` exports `displayIdentifier(identifier)`, the sanitiser its text and
  Markdown renderers already used.
