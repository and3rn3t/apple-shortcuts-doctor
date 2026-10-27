### Added

- The web report has a "Download Markdown report" button that saves exactly the Markdown the CLI
  prints, as `shortcuts-doctor-report.md`, through a local blob: nothing is uploaded, and the
  name of the inspected file is never reused. Tested in Chromium under the strict CSP (#37).
