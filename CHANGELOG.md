# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- Pending entries live in changelog.d/ (see its README); a release assembles them here. -->

## [0.4.0] - 2026-10-27

### Added

- The release workflow verifies what it published: it waits for npm to serve the new version,
  installs it into an empty project, and checks `--version`, every fixture format, and the SLSA
  provenance attestation (`scripts/verify-published.sh`).
- The web app ships a strict Content-Security-Policy and related headers in `apps/web/public/_headers`
  (`default-src 'none'`, `connect-src 'none'`, no inline scripts or styles, no framing), so the page
  can open no connection. `pnpm validate` now also runs `scripts/check-web-build.mjs`, which fails
  the build on any network API, inline or external resource, or CSP that allows more than
  `'none'`, `'self'`, and `data:` (#36).
- The release workflow can deploy the web app to Cloudflare Workers and verify the live site
  (`deploy-web`, opt-in via `DEPLOY_WEB`). `scripts/verify-deployed.mjs` requires every built file
  to be served byte-for-byte with its `_headers` headers. CI validates the deploy configuration
  with `wrangler deploy --dry-run`. Setup steps are in CONTRIBUTING.
- `apps/web/README.md` explains how the web app keeps the file in the browser and how to develop it.
- A Playwright end-to-end suite for the web app, run in CI (`web-e2e`) and locally with
  `pnpm test:e2e`. In real Chromium, against `wrangler dev` with the shipped headers, it checks
  that the served CSP matches `public/_headers` and is enforced, that inspecting JSON, XML plist,
  and binary plist exports (and refused files) makes no request and stores nothing, keyboard-only
  use, drag and drop, and an axe accessibility scan of the empty page, a report, and an error in
  both color themes.
- The web app can inspect an export: choose a file with a keyboard-reachable button, or drop one
  on the page. The file is read in the browser, refused before reading if it is over 4 MiB, and
  inspected with the same core code as the CLI (JSON, XML plist, binary plist). Errors show core's
  fixed, content-free messages; a signed `.shortcut` file also links to "Getting an export". For
  now it shows the action and finding counts; the full report view follows (#35).
- `@shortcuts-doctor/core` exports `isSignedExport(bytes)`.
- The web build guard rejects `localStorage`, `sessionStorage`, and `indexedDB`, so an inspected
  export can't outlive the tab.
- The web report has a "Download Markdown report" button that saves exactly the Markdown the CLI
  prints, as `shortcuts-doctor-report.md`, through a local blob: nothing is uploaded, and the
  name of the inspected file is never reused. Tested in Chromium under the strict CSP (#37).
- The web app works offline and can be installed. A small service worker, generated at build time,
  precaches the app's own files and serves exactly those from the cache; it never caches anything
  else, and the exports you inspect never pass through it. A web app manifest and icons (including
  a maskable one and an Apple touch icon) make it installable. Verified in Chromium: it reloads,
  inspects an export, and downloads the report with the network off, and the cache holds only the
  build's files before and after (#37, [ADR-0003](docs/adr/0003-web-app-architecture.md)).
- The web build guard checks that the worker precaches exactly the build's files, that the manifest's
  icons exist, and that `/sw.js` is the only path that replaces the page's CSP, with a policy that
  allows connecting to its own origin and nothing else.
- The web app shows the full report for an inspected export: a summary, findings grouped by
  severity and kind (each grouped finding lists every action it covers as links), the numbered
  actions with links to the actions they use, an "unresolved reference" count, core's limitations,
  and a persistent note that the report is not a safety verdict. Identifiers are rendered as
  text only, and focus moves to the report when it appears (#35).
- `@shortcuts-doctor/core` exports `displayIdentifier(identifier)`, the sanitiser its text and
  Markdown renderers already used.
- `apps/web` scaffold: a Vite + React app, deployable as Cloudflare Workers static assets, that
  runs the core inspector in the browser on a built-in sample (#34).

### Changed

- Changelog entries are now fragments in `changelog.d/`, assembled into `CHANGELOG.md` at release
  by `pnpm changelog release X.Y.Z`. Concurrent PRs no longer conflict on `CHANGELOG.md`, which
  GitHub can't auto-resolve (it ignores `merge=union`). `pnpm validate` checks every fragment.
- CodeQL runs one analysis instead of two. Its `javascript` extractor already covers TypeScript,
  so the separate `typescript` job repeated the same 201 rules with the same results.
- Findings from the same rule are now grouped: when one rule matches several actions, the report
  has a single finding whose `actions` lists all of them, in order of first action. On a real
  35-action Shortcut this turns 11 findings into 3 (nine identical Health findings become one).
  `summary.findingsBySeverity`, the text summary, and the `--fail-on` note count grouped findings,
  so JSON consumers will see lower counts and longer `actions` arrays. Which Shortcuts fail a
  `--fail-on` threshold is unchanged (#72).
- The web app sets explicit background, text, and link colors instead of relying on the browser's
  dark-canvas default, so contrast is the same everywhere and can be measured.
- Type-checking of the web app is split so that `src` is checked without Node's types: app code
  can no longer reach for Node globals by accident (tests, the build plugin, and e2e have their own
  configs).

### Fixed

- `pnpm validate` (and the pre-push hook) no longer lint, format-check, or run the tests of Claude
  Code worktrees checked out under `.claude/worktrees/`, which made it fail in the main checkout
  whenever one existed.

### Security

- CI lints every workflow with actionlint and zizmor. Fixing their findings: checkouts no longer
  leave the GitHub token in `.git/config`, the release workflow grants `contents: write` only to
  the job that creates the GitHub Release, and release builds never restore a dependency cache, so
  a cache written by a pull request can't reach a published package.

## [0.3.1] - 2026-10-27

Fixes found by checking 0.3.0 against 138 real, published Shortcuts.

### Fixed

- **Binary plists with 16-byte integers no longer fail to decode.** CoreFoundation stores unsigned
  64-bit numbers, such as a date action's calendar `Unit`, as 16-byte integers even when the
  value is small. 0.3.0 rejected 12 of the 138 Shortcuts (8.7%); all 138 now decode and match
  Python's `plistlib` (dates to the millisecond). Values outside JavaScript's safe-integer range
  are still rejected (#75).
- **Three catalog identifiers were wrong.** Real exports use `documentpicker.open` (Get File),
  `file.delete` (Delete Files), and `selectphoto` (Select Photos), not `getfile`, `deletefiles`,
  and `selectphotos`. These actions were reported only as unknown, so file deletion never got its
  `destructive` warning (#76).
- Binary plist strings decode with the native `TextDecoder`, about 4× faster, so hostile files
  that stay inside the 64 MiB decoded-byte budget are rejected quickly (#74).

### Added

- `scripts/profile-exports.mjs`, a stats-only structural profiler for folders of exports. It prints
  Apple-defined structure and counts and redacts everything else. Findings from 138 published
  Shortcuts are in [docs/research/export-format.md](docs/research/export-format.md) (#77).

## [0.3.0] - 2026-10-27

Works on real exports: plist files on any OS, stdin input, clearer errors, far less rule noise,
and docs that match what the tool does.

### Added

- **Plist exports (XML and binary) now work on Linux and Windows.** A new pure-TypeScript decoder
  in `@shortcuts-doctor/core` bounds nesting depth, value count, decoded bytes, and every binary
  offset, and rejects reference cycles, so the same file gives the same report on every OS.
  `<data>` and `<date>` values, which `plutil` couldn't convert, now decode too (#24,
  [ADR-0002](docs/adr/0002-pure-ts-plist-parser.md)).
- Pass `-` as the export file to read it from stdin, with the same 4 MiB limit. An interactive
  terminal on stdin exits `1` with a message instead of hanging (#26).
- `--version` / `-v` prints the CLI version (baked in at build time), and `-h` is an alias for
  `--help` (#25).
- The rule catalog is now data in `packages/core/src/rules.ts` (`CATALOG`), with each action's
  Shortcuts title so classifications can be checked. It grows from 18 rules and 17 basic actions
  to 38 rules (camera, microphone, calendar, reminders, Health, AirDrop, clipboard writes, more
  network actions, photo deletion) and 70 basic actions. On a real 35-action Shortcut,
  `unknown-action` findings drop from 22 to 1 (#27).
- "Getting an export" docs in the README, SKILL.md, and CLI README: app exports are always signed
  (checked on current iOS and macOS), how to get the unsigned copy from an iCloud link, and why
  signed files aren't decoded (#28).
- CI packs the npm tarball, installs it into an empty project on Node 22 and 24, and checks the
  file list, executable bit, shebang, `--version`, every fixture format, and exit codes. Run it
  locally with `pnpm smoke:pack` (#31). CI also runs `pnpm validate` on Windows.
- `homepage` and `bugs` fields in the npm package metadata (#33).

### Changed

- `unknown-action` findings now have a `ruleId` of `unknown-apple-action` (an Apple identifier
  the catalog doesn't cover) or `third-party-action` (an app intent), with separate messages.
  The `code` is still `unknown-action` and the severity is still `review`, so `--fail-on` is
  unaffected. **Consumers that matched `ruleId: "unknown-action"` need updating** (#27).
- Signed `.shortcut` (AEA) files get their own error message, and both that and the
  unsupported-export error point to "Getting an export" (#28).
- The CLI parses arguments with `node:util` `parseArgs` in strict mode. Unknown options and
  `--flag=value` on boolean flags exit `1` instead of being treated as file names, and
  `--option=value` works for value options (#32).
- Docs claim only what the tool does today (diagnosis and repair suggestions are marked as planned
  for v0.6), link milestones instead of internal M1/M2 labels, and CONTRIBUTING has real setup,
  testing, roadmap, and release instructions (#29).

### Removed

- The CLI no longer spawns `/usr/bin/plutil`; the product runs no subprocesses. The skill bundle
  no longer exports `convertWithPlutil`, and `parseExport` is now core's, with no platform
  argument (#24).

### Fixed

- Unrecognized options exit `1` with `Unknown option: <name>. Run --help for usage.` instead of
  `Cannot read the supplied export file.` Only the option name is printed, never its value (#25).
- The release workflow fails if the pushed tag doesn't match the package versions, and the npm
  job fails if that version is already published or the registry can't be checked, instead of
  skipping quietly (#30).
- The "Skill on Node 22" CI job was running Node 24; it now runs Node 22 against every fixture
  format (#24).

## [0.2.0] - 2026-10-27

### Changed

- **JSON output is now `formatVersion: 2` by default.** Pass `--format-version 1` for the old shape.
- Rewrote the inspector in TypeScript as `@shortcuts-doctor/core` (browser-safe engine) and
  `packages/cli` (Node entrypoint). `skills/shortcuts-doctor/scripts/inspect-shortcut.mjs` is now
  generated by esbuild, and its output is byte-identical to the previous hand-written script.
- Split tests into core unit tests, CLI unit tests, and integration tests against the bundled
  skill script. Added a real-`plutil` plist test on macOS.
- CI runs the full `pnpm validate` gate on Ubuntu and macOS and runs the skill on Node 22.
- Releases attach the skill directory as a zip.

### Added

- npm packaging for `shortcuts-doctor`: self-contained bin built by `pnpm build:cli`
  (`packages/cli/dist/`, gitignored, built by `prepack` and `validate`), and an opt-in
  `publish-npm` release job using trusted publishing with provenance.
- `--fail-on review|warning` (exit code 2 when findings reach the threshold) and `--quiet`,
  for CI use. Exit code 1 still means usage or input errors.
- `shortcuts-doctor inspect <file>` subcommand and a `bin` entry in `packages/cli`. The bare
  `inspect-shortcut.mjs -- <file>` form used by the skill is unchanged.
- Report `formatVersion: 2`: adds `summary` (counts by severity and category) and a stable
  `ruleId` on each finding. Published as `schema/report.v2.json` and tested with Ajv. Legacy
  output remains available via `--format json --format-version 1` and `toReportV1`.
- `--format text|json|md` with core renderers (`renderText`, `renderMarkdown`, `renderReport`).
  Text is the default on a TTY; JSON when piped, so the skill's output is unchanged.
- ESLint, Prettier, `tsc` type-check, coverage thresholds, husky + lint-staged + commitlint.
- `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, ADR-0001.

### Removed

- Unused template scaffolding: web profile, Lighthouse workflow, frontend/database/API
  instructions and prompts, document templates, Python pre-commit config.

## [0.1.0] - 2026-10-18

### Added

- `shortcuts-doctor` OpenClaw skill: static inspection of unsigned Shortcut exports (JSON, XML
  and binary plist via `plutil`) with redacted, no-execution reporting.
