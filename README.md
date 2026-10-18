# Shortcuts Doctor 🩺

Static inspection for Apple Shortcuts exports. Shortcuts Doctor explains what a Shortcut does,
what data it could expose, and why it might have stopped working, **without running it**.

[![CI](https://github.com/and3rn3t/apple-shortcuts-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/and3rn3t/apple-shortcuts-doctor/actions/workflows/ci.yml)

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

## Surfaces

| Surface                | Status       | Location                                                          |
| ---------------------- | ------------ | ----------------------------------------------------------------- |
| Agent skill (OpenClaw) | ✅ available | [`skills/shortcuts-doctor/`](skills/shortcuts-doctor/)            |
| CLI                    | 🟡 internal  | [`packages/cli/`](packages/cli/) (npm release planned, M1)        |
| Web app                | ⬜ planned   | `apps/web/`: client-side only, file never leaves the browser (M2) |

See [docs/ROADMAP.md](docs/ROADMAP.md) for what's next.

## Usage

### As an agent skill

Copy the whole `skills/shortcuts-doctor/` directory into your OpenClaw workspace's `skills/`
directory or `~/.openclaw/skills/`, then start a new session. Requires Node.js 22 or newer and no
npm install. [SKILL.md](skills/shortcuts-doctor/SKILL.md) covers the workflow and safety rules.

### Directly

```bash
node skills/shortcuts-doctor/scripts/inspect-shortcut.mjs -- /absolute/path/export.json
```

Output is a JSON report on stdout. Exit code `1` means the file was unreadable, unsupported, or
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
