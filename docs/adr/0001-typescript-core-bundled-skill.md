# ADR-0001: TypeScript core with a generated, committed skill bundle

- **Status**: accepted
- **Date**: 2026-10-18

## Context

The project began as one hand-written, zero-dependency `inspect-shortcut.mjs` inside an OpenClaw
skill. It's now expanding to a CLI and a client-side web app. All three need the same inspection
logic, the web app can't import Node modules, and the skill must remain installable by copying a
single directory with no `npm install` or build step.

## Decision

- Write the engine in TypeScript as `@shortcuts-doctor/core`, a browser-safe package with plist
  decoding injected as a `convertPlist` function.
- Put Node-specific code (bounded file read, `plutil` converter, argv) in `packages/cli`.
- Bundle `packages/cli` with esbuild into `skills/shortcuts-doctor/scripts/inspect-shortcut.mjs`,
  commit the output, and fail CI if it drifts (`pnpm build:skill:check`).
- Packages are consumed as TypeScript source inside the workspace (`exports` → `src/index.ts`),
  with no per-package build.

## Consequences

- One implementation serves all surfaces. Types catch report-shape regressions.
- Contributors must run `pnpm build:skill` after source changes. The drift check catches misses.
- The skill's runtime surface stays dependency-free, and integration tests run against the bundle
  exactly as installed.
- Generated code appears in diffs. Reviewers should focus on `packages/*/src`.

## Alternatives Considered

- **Plain JS + JSDoc + `checkJs`**: no build step, but weaker types and awkward module sharing
  with a React web app. Rejected in favor of first-class TypeScript.
- **Build on install / don't commit the bundle**: breaks the "copy the directory" install path
  for the skill.
- **Publish core to npm and have the skill depend on it**: the skill would need `npm install`,
  which the skill format and its safety story avoid.
