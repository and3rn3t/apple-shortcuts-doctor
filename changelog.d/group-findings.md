### Changed

- Findings from the same rule are now grouped: when one rule matches several actions, the report
  has a single finding whose `actions` lists all of them, in order of first action. On a real
  35-action Shortcut this turns 11 findings into 3 (nine identical Health findings become one).
  `summary.findingsBySeverity`, the text summary, and the `--fail-on` note count grouped findings,
  so JSON consumers will see lower counts and longer `actions` arrays. Which Shortcuts fail a
  `--fail-on` threshold is unchanged (#72).
