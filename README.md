# Shortcuts Doctor 🩺

Static inspection for Apple Shortcuts exports. Shortcuts Doctor explains what a Shortcut does,
what data it could expose, and which references look broken, **without running it**. Diagnosing
why a Shortcut stopped working and suggesting repairs are planned for
[v0.6](https://github.com/and3rn3t/apple-shortcuts-doctor/milestone/4).

[![CI](https://github.com/and3rn3t/apple-shortcuts-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/and3rn3t/apple-shortcuts-doctor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/shortcuts-doctor)](https://www.npmjs.com/package/shortcuts-doctor)
[![License: MIT](https://img.shields.io/github/license/and3rn3t/apple-shortcuts-doctor)](LICENSE)
[![Node](https://img.shields.io/node/v/shortcuts-doctor)](https://nodejs.org)

## What it does

Given an unsigned Shortcut export (JSON, XML plist, or binary plist), it produces a report with:

- **Action walkthrough**: numbered actions and their explicit output dependencies
- **Findings**: sensitive inputs (clipboard, location, camera, microphone, photos, contacts,
  calendar, reminders, Health, files), outbound channels (network requests, messages, email,
  sharing, AirDrop, clipboard, URLs), code execution (AppleScript, JavaScript, shell, SSH),
  destructive actions, nested Shortcuts, broken or ambiguous references, and actions outside the
  [rule catalog](packages/core/src/rules.ts), split into Apple actions the catalog doesn't cover
  yet (`unknown-apple-action`) and third-party app actions (`third-party-action`)
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

Shortcuts Doctor reads **unsigned** workflow files: JSON, XML plist, or binary plist. To check a
file, look at its first bytes: `head -c 8 file.shortcut` prints `AEA1…` for a signed file and
`bplist00` or `<?xml` for an unsigned one.

| Source                                                             | Works? | Notes                                                                                                             |
| ------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------- |
| **Share → Export File** (iPhone, iPad) or **File → Export…** (Mac) | No     | Always **signed** (`AEA1`), whether you pick _Anyone_ or _People Who Know Me_. Shortcuts Doctor says so and stops |
| A workflow plist or JSON you generate or keep in a repository      | Yes    | For example the input you pass to `shortcuts sign`. This is the main CI use case                                  |
| An iCloud link's unsigned copy                                     | Yes    | See the steps below. Sharing a link **publishes** the Shortcut to anyone who has the link                         |

Checked on current macOS and iOS in October 2026. Older `.shortcut` files from before signing
existed work if they start with `bplist00`.

### From an iCloud link

1. In Shortcuts, choose **Share → Copy iCloud Link** (on a Mac, right-click the shortcut). The
   link ends in an ID: `https://www.icloud.com/shortcuts/<id>`.
2. Download the record's `shortcut` asset, which is the unsigned binary plist (its
   `signedShortcut` asset is signed and won't work). The asset URL contains a `${f}` placeholder
   for a file name:

   ```bash
   url=$(curl -s https://www.icloud.com/shortcuts/api/records/<id> | python3 -c 'import json, sys; print(json.load(sys.stdin)["fields"]["shortcut"]["value"]["downloadURL"].replace("${f}", "shortcut.plist"))')
   curl -sL -o shortcut.plist "$url"
   ```

3. Inspect it: `npx shortcuts-doctor inspect shortcut.plist`.

Before you share a link for a Shortcut that holds private text, tokens, or URLs, remove them in
the Shortcuts app or work from a redacted copy. Shortcuts Doctor itself never contacts iCloud.

**Why signed files aren't decoded:** a signature is how Shortcuts proves who made a file. The
inspector won't strip it, and it won't extract the payload without verifying the signature.
Read-only inspection with the signature checked is being researched in
[#57](https://github.com/and3rn3t/apple-shortcuts-doctor/issues/57).

## Surfaces

| Surface                | Status       | Location                                                                                                                              |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Agent skill (OpenClaw) | ✅ available | [`skills/shortcuts-doctor/`](skills/shortcuts-doctor/)                                                                                |
| CLI                    | ✅ available | [`shortcuts-doctor` on npm](https://www.npmjs.com/package/shortcuts-doctor)                                                           |
| Web app                | ⬜ planned   | `apps/web/`: client-side only, file never leaves the browser ([v0.4](https://github.com/and3rn3t/apple-shortcuts-doctor/milestone/2)) |

See the [milestones](https://github.com/and3rn3t/apple-shortcuts-doctor/milestones) and
[issues](https://github.com/and3rn3t/apple-shortcuts-doctor/issues) for what's next
([docs/ROADMAP.md](docs/ROADMAP.md) explains how they are organized).

## Usage

### From npm

```bash
npx shortcuts-doctor inspect /absolute/path/export.json
npx shortcuts-doctor inspect --format md --fail-on warning export.json
cat export.json | npx shortcuts-doctor inspect -   # read from stdin
```

Requires Node.js 22 or newer and works the same on macOS, Linux, and Windows: plist exports are
decoded in pure TypeScript, with no subprocesses. See the
[CLI README](packages/cli/README.md) for all options, exit codes, and a CI example.

### As an agent skill

Copy the whole `skills/shortcuts-doctor/` directory into your OpenClaw workspace's `skills/`
directory or `~/.openclaw/skills/`, then start a new session. Requires Node.js 22 or newer and no
npm install. [SKILL.md](skills/shortcuts-doctor/SKILL.md) covers the workflow and safety rules.

### Directly

```bash
node skills/shortcuts-doctor/scripts/inspect-shortcut.mjs -- /absolute/path/export.json
```

It takes the same options as the npm CLI: see the [CLI README](packages/cli/README.md) for
formats, `--fail-on`, and exit codes. JSON output follows
[`schema/report.v2.json`](schema/report.v2.json).

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
packages/cli/    Node entrypoint: bounded file/stdin reading, argv handling
skills/          The distributable skill; scripts/inspect-shortcut.mjs is GENERATED from packages/
tests/           Integration tests against the bundled script, plus shared fixtures
docs/            Roadmap, architecture, ADRs
```

**Don't edit `inspect-shortcut.mjs` by hand.** Change `packages/*/src`, run `pnpm build:skill`,
and commit both. CI fails if the bundle is stale.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## License

[MIT](LICENSE)
