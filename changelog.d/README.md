# Changelog fragments

Each pull request adds one file here instead of editing `CHANGELOG.md`, so concurrent PRs never
conflict. Name it after your branch (for example `fix-plist-dates.md`) and use only Keep a
Changelog headings and bullets:

```markdown
### Fixed

- Dates in binary plists decode to the millisecond (#123).
```

Allowed headings: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Continuation
lines are indented two spaces. `pnpm validate` checks every fragment; `node scripts/changelog.mjs
preview` shows the assembled section, and the release PR runs `node scripts/changelog.mjs release
X.Y.Z`, which writes the section and deletes the fragments.
