# Shortcuts Doctor 🩺

Static inspection for Apple Shortcuts exports. Shortcuts Doctor explains what a Shortcut does,
what data it could expose, and why it might have stopped working, **without running it**.

[![CI](https://github.com/and3rn3t/apple-shortcuts-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/and3rn3t/apple-shortcuts-doctor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/shortcuts-doctor)](https://www.npmjs.com/package/shortcuts-doctor)
[![License: MIT](https://img.shields.io/github/license/and3rn3t/apple-shortcuts-doctor)](LICENSE)
[![Node](https://img.shields.io/node/v/shortcuts-doctor)](https://nodejs.org)

## What it does

Given an unsigned Shortcut export (JSON, XML plist, or binary plist), it produces a report with:

- **Action walkthrough**: numbered actions and their explicit output dependencies
- **Findings**: sensitive inputs (clipboard, location, photos, contacts, files), outbound channels
  (network requests, messages, email, sharing, URLs), code execution (AppleScript, JavaScript,
  shell, SSH), destructive actions, nested Shortcuts, unknown actions, and broken or ambiguous
  references
- **Limitations**: what static inspection cannot tell you

### Safety model

- **Never executes anything.** It doesn't run actions, embedded scripts, URLs, or nested Shortcuts.
- **Redacted output.** Reports never include parameter values, URLs, headers, message bodies,
  tokens, UUIDs, or file paths. Action identifiers still show which apps are used.
- **No network access, no file writes.** It reads one file you supply and writes to stdout.
- **No "safe" verdict.** Severity labels (`review`, `warning`) set the order of manual review.
  An empty findings list doesn't mean the Shortcut is safe.
- Signed `.shortcut` containers aren't decoded, and signatures are never bypassed.

## Getting an export

Shortcuts Doctor reads **unsigned** workflow files: JSON, XML plist, or binary plist.

| Source                                                        | Works? | Notes                                                                                                                                                                                                        |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Share → Export File** in Shortcuts (iOS 15+, macOS 12+)     | No     | Produces a **signed** `.shortcut` file (an Apple Encrypted Archive). Shortcuts Doctor recognizes it and stops                                                                                                |
| `.shortcut` files from iOS 14 / macOS 11 or earlier           | Yes    | These were unsigned binary plists                                                                                                                                                                            |
| A workflow plist or JSON you generate or keep in a repository | Yes    | For example the input you pass to `shortcuts sign`. This is the main CI use case                                                                                                                             |
| An iCloud share link's unsigned copy                          | Yes    | The link's record (`https://www.icloud.com/shortcuts/api/records/<id>`) has a `fields.shortcut.value.downloadURL` pointing at an unsigned plist. Sharing a link **publishes** the Shortcut to anyone with it |

Before you share a link for a Shortcut that holds private text, tokens, or URLs, remove them in
the Shortcuts app or work from a redacted copy. Shortcuts Doctor itself never contacts iCloud.

**Why signed files aren't decoded:** a signature is how Shortcuts proves who made a file. The
inspector won't strip it, and it won't extract the payload without verifying the signature.
Read-only inspection with the signature checked is being researched in
[#57](https://github.com/and3rn3t/apple-shortcuts-doctor/issues/57).

## Surfaces

| Surface                | Status       | Location                                                                    |
| ---------------------- | ------------ | --------------------------------------------------------------------------- |
| Agent skill (OpenClaw) | ✅ available | [`skills/shortcuts-doctor/`](skills/shortcuts-doctor/)                      |
| CLI                    | ✅ available | [`shortcuts-doctor` on npm](https://www.npmjs.com/package/shortcuts-doctor) |
| Web app                | ⬜ planned   | `apps/web/`: client-side only, file never leaves the browser (M2)           |

See the [milestones](https://github.com/and3rn3t/apple-shortcuts-doctor/milestones) and
[issues](https://github.com/and3rn3t/apple-shortcuts-doctor/issues) for what's next
([docs/ROADMAP.md](docs/ROADMAP.md) explains how they are organized).

## Usage

### From npm

```bash
npx shortcuts-doctor inspect /absolute/path/export.json
npx shortcuts-doctor inspect --format md --fail-on warning export.json
```

Requires Node.js 22 or newer. Plist exports (the usual Shortcuts export format) are decoded with
macOS's built-in `plutil`; on Linux and Windows only JSON exports work for now. See the
[CLI README](packages/cli/README.md) for all options, exit codes, and a CI example.

### As an agent skill

Copy the whole `skills/shortcuts-doctor/` directory into your OpenClaw workspace's `skills/`
directory or `~/.openclaw/skills/`, then start a new session. Requires Node.js 22 or newer and no
npm install. [SKILL.md](skills/shortcuts-doctor/SKILL.md) covers the workflow and safety rules.

### Directly

```bash
node skills/shortcuts-doctor/scripts/inspect-shortcut.mjs -- /absolute/path/export.json
```

Output is a JSON report on stdout (`--format text|json|md`; text is the default on a terminal; `--format-version 1` selects the legacy JSON shape; schema in `schema/report.v2.json`). `--fail-on review|warning` exits `2` when findings reach that severity (add `--quiet` to suppress the report). Exit code `1` means the file was unreadable, unsupported, or
malformed. Plist exports need macOS (`/usr/bin/plutil`); JSON works anywhere.

## Development

Requires Node 24 (see `.nvmrc`) and pnpm.

```bash
pnpm install
pnpm test            # vitest (unit + bundle integration)
pnpm lint            # eslint
pnpm type-check      # tsc for each package + tests
pnpm build:skill     # regenerate skills/shortcuts-doctor/scripts/inspect-shortcut.mjs
pnpm validate        # everything CI runs, incl. bundle drift check
```

### Layout

```text
packages/core/   @shortcuts-doctor/core: browser-safe parsing + inspection engine (TypeScript)
packages/cli/    Node entrypoint: file reading, plutil plist conversion, argv handling
skills/          The distributable skill; scripts/inspect-shortcut.mjs is GENERATED from packages/
tests/           Integration tests against the bundled script, plus shared fixtures
docs/            Roadmap, architecture, ADRs
```

**Don't edit `inspect-shortcut.mjs` by hand.** Change `packages/*/src`, run `pnpm build:skill`,
and commit both. CI fails if the bundle is stale.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## License

[MIT](LICENSE)
