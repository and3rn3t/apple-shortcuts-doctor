### Added

- Possible source-to-sink paths (#41). When data from a sensitive input (Health, clipboard, location,
  contacts, and the like, including clipboard and device-details tokens) may reach an outbound
  action, the report has one `possible-flow` finding per outbound action. It lists every source in
  `actions` and gives up to ten example routes in `paths`, such as `#4 -> #5 -> #6 -> #33 -> #35`.
  Routes follow stated references, variables, and the inferred default inputs from #40; a route
  that needs an inferred step is marked `inferred`. The wording is always "may reach": it is
  structure, not proof of what is sent, and no value, name, or URL is in the finding.
- Text and Markdown print the first three routes under the finding, and the web report shows them
  as links under "Possible data flows".
- Severity is `warning` when a route uses only stated links, and `review` when every route relies on
  an inferred step. Because of that, `--fail-on warning` now also fails a Shortcut whose Health
  data, for example, may reach a network request.
- Checked on 138 real exports: 21 have a possible flow (52 findings, one relying only on an
  inferred step, longest route 21 actions), no failures, 0.3 s for all of them. On a Shortcut
  that reads nine Health quantities and posts a dictionary, one finding names all nine reads and
  the request.
