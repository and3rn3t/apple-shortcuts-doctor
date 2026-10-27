### Fixed

- `pnpm validate` (and the pre-push hook) no longer lint, format-check, or run the tests of Claude
  Code worktrees checked out under `.claude/worktrees/`, which made it fail in the main checkout
  whenever one existed.
