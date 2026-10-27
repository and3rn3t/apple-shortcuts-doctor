### Added

- The web app works offline and can be installed. A small service worker, generated at build time,
  precaches the app's own files and serves exactly those from the cache; it never caches anything
  else, and the exports you inspect never pass through it. A web app manifest and icons (including
  a maskable one and an Apple touch icon) make it installable. Verified in Chromium: it reloads,
  inspects an export, and downloads the report with the network off, and the cache holds only the
  build's files before and after (#37, [ADR-0003](docs/adr/0003-web-app-architecture.md)).
- The web build guard checks that the worker precaches exactly the build's files, that the manifest's
  icons exist, and that `/sw.js` is the only path that replaces the page's CSP, with a policy that
  allows connecting to its own origin and nothing else.

### Changed

- Type-checking of the web app is split so that `src` is checked without Node's types: app code
  can no longer reach for Node globals by accident (tests, the build plugin, and e2e have their own
  configs).
