### Added

- The web app can inspect an export: choose a file with a keyboard-reachable button, or drop one
  on the page. The file is read in the browser, refused before reading if it is over 4 MiB, and
  inspected with the same core code as the CLI (JSON, XML plist, binary plist). Errors show core's
  fixed, content-free messages; a signed `.shortcut` file also links to "Getting an export". For
  now it shows the action and finding counts; the full report view follows (#35).
- `@shortcuts-doctor/core` exports `isSignedExport(bytes)`.
- The web build guard rejects `localStorage`, `sessionStorage`, and `indexedDB`, so an inspected
  export can't outlive the tab.
