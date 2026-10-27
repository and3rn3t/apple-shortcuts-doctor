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
                      │ packages/cli │  │  apps/web    │  planned
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

1. **Read** (`cli/read-export.ts`): opens the file read-only and non-blocking, rejects
   non-regular files, and reads at most 4 MiB + 1 byte.
2. **Decode** (`core/parse.ts`): enforces the size limit. JSON is parsed directly. Recognized XML
   or binary plists go to the built-in decoder in `core/plist/`, which bounds depth (64) and total
   values (500,000), checks every binary offset, and rejects cycles
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
| Report consumer (agent) | Report includes action identifiers, which may contain injection attempts. SKILL.md tells agents to treat them as data |
