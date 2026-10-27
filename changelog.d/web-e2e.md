### Added

- A Playwright end-to-end suite for the web app, run in CI (`web-e2e`) and locally with
  `pnpm test:e2e`. In real Chromium, against `wrangler dev` with the shipped headers, it checks
  that the served CSP matches `public/_headers` and is enforced, that inspecting JSON, XML plist,
  and binary plist exports (and refused files) makes no request and stores nothing, keyboard-only
  use, drag and drop, and an axe accessibility scan of the empty page, a report, and an error in
  both color themes.

### Changed

- The web app sets explicit background, text, and link colors instead of relying on the browser's
  dark-canvas default, so contrast is the same everywhere and can be measured.
