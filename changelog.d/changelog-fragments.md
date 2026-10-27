### Changed

- Changelog entries are now fragments in `changelog.d/`, assembled into `CHANGELOG.md` at release
  by `pnpm changelog release X.Y.Z`. Concurrent PRs no longer conflict on `CHANGELOG.md`, which
  GitHub can't auto-resolve (it ignores `merge=union`). `pnpm validate` checks every fragment.
