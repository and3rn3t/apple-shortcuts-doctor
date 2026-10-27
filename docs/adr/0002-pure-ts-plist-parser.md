# ADR-0002: Decode plists in pure TypeScript inside core

- **Status**: accepted
- **Date**: 2026-10-27
- **Amends**: [ADR-0001](0001-typescript-core-bundled-skill.md) (plist decoding is no longer
  injected by the CLI)

## Context

Most real Shortcut exports are plists. The CLI decoded them by spawning macOS `/usr/bin/plutil`,
so on Linux and Windows only JSON worked. That made `--fail-on` on Linux CI runners (the main CI
use case) effectively unusable, and it blocked the client-side web app, which can't spawn
anything. `plutil -convert json` also rejects `<data>` and `<date>` values, which real workflows
can contain.

## Decision

- Decode XML plists and `bplist00` in `packages/core/src/plist/`, browser-safe and
  dependency-free. `parseExport` uses it by default. `ParseOptions.convertPlist` stays as an
  override for tests.
- Accept only what a workflow needs: dict, array, string, integer, real, boolean, date, data.
  Reject DTD internal subsets, unknown entities, UIDs, sets, and null markers.
- Bound hostile input beyond the existing 4 MiB check: nesting depth (64), total decoded values
  (500,000) and total decoded string/data bytes (64 MiB), which together cap expansion of shared
  binary references, and cycle detection. Every
  offset and reference in a binary plist is bounds-checked.
- Dictionaries are prototype-less objects, so keys like `__proto__` stay ordinary data. Dates
  decode to `Date` and data to `Uint8Array`, which the inspector treats as leaf values.
- Remove `plutil` from the CLI. The product now spawns no subprocesses. A macOS-only test
  cross-checks the decoder against `plutil` on the fixtures.

## Alternatives considered

- **An npm plist library.** It would add a runtime dependency to the zero-dependency skill
  bundle, and we'd still have to audit it for browser safety and for depth and expansion bounds.
- **Keep `plutil` on macOS, pure TS elsewhere.** Two decoders would disagree on edge cases (for
  example `<data>`), and reports would differ by OS.

## Consequences

- Fixtures inspect identically on macOS, Linux, and Windows. CI runs all three.
- About 400 lines of parser code to maintain. Malformed-input and mutation tests guard it; deeper
  fuzzing is tracked in #53.
- Very large integers lose precision beyond 2^53 (values over that in binary plists are
  rejected). Nothing in a workflow's inspected structure depends on them.
