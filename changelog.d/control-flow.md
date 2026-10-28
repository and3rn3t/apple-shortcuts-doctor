### Added

- Control-flow structure (#38). Each action in the report now has a `depth` (how many if / menu /
  repeat blocks enclose it) and, on the actions that open, continue, or close a block, a `flow`
  with a block number and role (`start`, `middle`, `end`). Text and Markdown reports indent
  nested actions and label block roles; the web report does the same. Structure comes from
  `WFControlFlowMode` and `GroupingIdentifier`, never from action names, and group ids are not
  copied into the report. Checked on 138 real exports: 2,456 blocks, all balanced, nesting up to 10.
- A new `unbalanced-control-flow` warning for a block with a missing or out-of-order start, else,
  or end, a reused group id, or an unreadable mode.
- Report format 2 stays at version 2: `depth`, `flow`, and the new finding code are additive, and
  `schema/report.v2.json` lists them. `--format-version 1` output is unchanged.

### Changed

- The "branches, loops" limitation now says blocks are shown as structure and never evaluated.

### Changed

- Markdown reports nest blocks as bullets with the action number written out, so nesting and
  numbering stay correct for any action number (`10.` and up included).
