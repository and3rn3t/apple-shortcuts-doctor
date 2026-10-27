# Architecture

## Overview

One TypeScript engine powers three surfaces. The engine is pure and browser-safe. Platform
concerns (reading files, converting plists, argv) live at the edges.

```text
                      ┌──────────────────────────────┐
                      │   @shortcuts-doctor/core     │  pure TS, no node:* imports
                      │  parseExport → inspectWorkflow│
                      │  plist/ (XML + bplist00)      │
                      │  rules · types · renderers    │
                      └──────┬───────────────┬────────┘
                             │               │
                      ┌──────┴──────┐  ┌─────┴────────┐
                      │ packages/cli │  │  apps/web    │  in progress
                      │ readExport   │  │  drag & drop │  client-side only
                      │ main(argv)   │  └──────────────┘
                      └──────┬──────┘
                    esbuild  │  scripts/build-skill.mjs
                      ┌──────┴──────────────────────────────────────┐
                      │ skills/shortcuts-doctor/scripts/            │  GENERATED, committed,
                      │   inspect-shortcut.mjs                      │  zero dependencies
                      └─────────────────────────────────────────────┘
```

## Data flow

0. **Arguments** (`cli/main.ts`): `node:util` `parseArgs` in strict mode, dispatched through a
   subcommand table (`inspect` is the default when no subcommand is named). Invalid options print
   usage; parser error text is never echoed because it can quote argv.
1. **Read** (`cli/read-export.ts`): opens the file read-only and non-blocking, rejects
   non-regular files, and reads at most 4 MiB + 1 byte.
2. **Decode** (`core/parse.ts`): enforces the size limit. JSON is parsed directly. Recognized XML
   or binary plists go to the built-in decoder in `core/plist/`, which bounds depth (64), total
   values (500,000), and decoded string/data bytes (64 MiB), checks every binary offset, and rejects cycles
   ([ADR-0002](adr/0002-pure-ts-plist-parser.md)). Anything else, including signed AEA
   containers, is rejected. Error messages never include content.
3. **Validate** (`core/inspect.ts`): checks the root shape, action count (≤ 2000), and each
   identifier and parameter shape. Any invalid action fails the whole inspection, so there are no
   partial reports.
4. **Inspect**: indexes declared output UUIDs, classifies each action against `rules.ts`, walks
   parameters for explicit `OutputUUID` references, and records dependencies to strictly earlier,
   unambiguous actions. Everything else counts as unresolved.
5. **Report**: a `Report` with actions, findings, and fixed limitations. Parameter values and
   UUIDs are never copied in.

## Web data flow

The web app (`apps/web`, [ADR-0003](adr/0003-web-app-architecture.md)) skips the CLI's read step.
The browser hands it a `File` from the picker or a drop; everything after that is the same core code
(`apps/web/src/inspect-file.ts`):

1. **Size**: `file.size` is checked against core's `MAX_BYTES` _before_ anything is read, so an
   oversized file is refused without loading it.
2. `file.arrayBuffer()` → `parseExport(new Uint8Array(buffer))` → `inspectWorkflow(workflow)` →
   `Report`.
3. **Errors** are core's fixed, content-free messages, plus fixed messages for an unreadable file.
   A signed container (`isSignedExport`) also gets a panel linking to "Getting an export". File
   names, parameter values, and UUIDs are never rendered.

4. **Report view** (`ReportView.tsx`): a summary, the findings grouped by severity (warnings first)
   and then by kind, the numbered actions with links between dependent actions, and core's fixed
   limitations under a "not a safety verdict" note. Identifiers pass through core's
   `displayIdentifier` and are rendered as text, never as HTML. Focus moves to the report heading
   once it renders. **Download Markdown report** saves core's `renderMarkdown(report)` (byte for
   byte what the CLI prints) through a local blob URL under a fixed file name.

There is no network request after the page loads and nothing is stored: the build guard
(`scripts/check-web-build.mjs`) rejects network and storage APIs in the bundle, and the CSP forbids
connections. A built-in sample can be inspected without a file.

## Why the skill script is generated

The skill has to stay copyable as a single directory with no `npm install`, while the source
benefits from types and multiple modules. esbuild bundles `packages/cli/src/index.ts` (and core)
into one ESM file targeting Node 22. `pnpm build:skill:check` rebuilds in memory and fails if the
committed file differs. See [ADR-0001](adr/0001-typescript-core-bundled-skill.md).

## Trust boundaries

| Boundary                | Treatment                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Export file contents    | Untrusted data. Size-bounded, shape-validated, never executed or echoed                                               |
| File path argument      | Passed as an argv element, never interpolated. Never echoed in errors                                                 |
| Plist structure         | Depth, value-count, and offset bounds; prototype-less dictionaries; no DTDs, entities beyond the XML five, or UIDs    |
| Web app page            | CSP `default-src 'none'` with `connect-src 'none'`: the page can open no connection. Checked at build time            |
| Web app offline worker  | Precaches the build's files and serves only those; declines everything else, caches nothing at runtime; own CSP       |
| Report consumer (agent) | Report includes action identifiers, which may contain injection attempts. SKILL.md tells agents to treat them as data |
