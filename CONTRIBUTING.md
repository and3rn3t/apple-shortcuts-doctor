# Contributing

Thank you for your interest in contributing! This guide will help you get started.

## How to Contribute

1. **Fork** the repository
2. **Create a branch** from `main` (see [Branch Naming](#branch-naming))
3. **Make your changes** with clear, focused commits
4. **Push** your branch and open a **Pull Request**

## Development Setup

Requires Node 24 (see `.nvmrc`) and pnpm. Use pnpm, not npm.

```bash
git clone https://github.com/YOUR_USERNAME/apple-shortcuts-doctor.git
cd apple-shortcuts-doctor
pnpm install
pnpm test       # unit + bundle integration tests
pnpm validate   # everything CI runs; also the pre-push hook
```

After changing anything under `packages/*/src`, run `pnpm build:skill` and commit the regenerated
`skills/shortcuts-doctor/scripts/inspect-shortcut.mjs` with it.

## Finding work

The roadmap is GitHub [milestones](https://github.com/and3rn3t/apple-shortcuts-doctor/milestones)
and [issues](https://github.com/and3rn3t/apple-shortcuts-doctor/issues). Pick an open issue from
the earliest milestone, reference it in your PR (`Closes #N`), and add an entry under
`[Unreleased]` in `CHANGELOG.md`. Log new ideas and tech debt as issues rather than in docs.

## Branch Naming

Use the format `type/short-description`:

- `feature/user-authentication`
- `fix/login-redirect-loop`
- `docs/update-api-reference`
- `chore/upgrade-dependencies`

See [git-conventions.instructions.md](.github/instructions/git-conventions.instructions.md) for full details.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): short description

Optional longer body explaining what and why.

Refs: #123
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`

**Examples:**

```
feat(auth): add OAuth2 login flow
fix(api): handle null response from user endpoint
docs: update contributing guide
test(cart): add edge case tests for empty cart
```

## What CI checks

- `pnpm validate` on Ubuntu, macOS, and Windows: lint, format, types, tests with coverage thresholds, and
  skill bundle drift.
- The skill bundle on Node 22, the oldest supported runtime.
- The packed npm tarball (`pnpm smoke:pack`) on Node 22 and 24: only `dist/`, `README.md`,
  `package.json`, and `LICENSE` ship, the bin is executable with a shebang, and it inspects a
  fixture in each format (JSON, XML plist, binary plist) with the expected exit codes and `--version`.
- The workflows themselves: [actionlint](https://github.com/rhysd/actionlint) for syntax and
  expressions, [zizmor](https://docs.zizmor.sh) for security (credential persistence, permissions,
  cache poisoning, injection, risky action pins). Run them locally with `actionlint` and
  `uvx zizmor .github/workflows`. Pin new actions by full commit SHA, set
  `persist-credentials: false` on checkouts that don't push, and grant permissions per job.

## Pull Request Process

1. Fill out the [PR template](.github/pull_request_template.md) completely
2. Ensure all checks pass (lint, tests, build)
3. Request a review from at least one maintainer
4. Address review feedback
5. A maintainer will merge your PR once approved

Keep PRs focused on a single logical change. Large changes should be split into smaller PRs.

## Code Style

This project uses shared code style guidelines enforced through:

- [`.editorconfig`](.editorconfig) — Cross-editor formatting
- [Code style instructions](.github/instructions/code-style.instructions.md) — Naming, formatting, and organization conventions

Run the linter before submitting:

```bash
pnpm lint
pnpm format
```

## Testing

All new code should include tests. Follow the patterns documented in:

- [Testing instructions](.github/instructions/testing.instructions.md) — Unit test patterns and conventions

Fixtures must be synthetic: use `.invalid` domains and obviously fake values, and never commit a
real personal Shortcut. Any test that touches parameter data needs a "does not leak" assertion.

To check parsing or rules against real exports, profile them instead of committing them:
`node scripts/profile-exports.mjs <folder>` prints structure and counts only. See
[docs/research/export-format.md](docs/research/export-format.md).

```bash
pnpm test
pnpm test:coverage
```

## Releasing

Maintainers only. A pushed `vX.Y.Z` tag runs [`release.yml`](.github/workflows/release.yml).

1. Set `"version"` to `X.Y.Z` in both `packages/cli/package.json` and
   `packages/core/package.json` (they move in lockstep), then run `pnpm build:skill` and commit
   the regenerated bundle: the CLI version is baked into it, so `pnpm validate` fails otherwise.
2. Move the `CHANGELOG.md` `[Unreleased]` entries under a new `[X.Y.Z] - YYYY-MM-DD` heading.
3. Merge that to `main`, then tag the merge commit and push the tag:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

The workflow fails before doing anything if the tag doesn't match both package versions. The npm
job fails if that version is already on the registry, or if the registry can't be checked.

- **Tag and version don't match:** delete the tag locally and on GitHub, fix the versions, merge,
  and tag the corrected commit:

  ```bash
  git tag --delete vX.Y.Z
  git push --delete origin vX.Y.Z
  ```

- **Version already on npm:** a published version can't be reused. Bump to a new, unpublished
  version and push a new matching tag.

npm publishing runs only when the `PUBLISH_NPM` repository variable is `true`.

## AI-Assisted Development

This repository includes configuration files for AI coding assistants (Copilot, Cursor, Windsurf, Cline, Claude Code). These files define project conventions so AI tools produce consistent, high-quality code.

- See [docs/AI-CUSTOMIZATION-GUIDE.md](docs/AI-CUSTOMIZATION-GUIDE.md) for details
- AI instructions in `.github/instructions/` are auto-loaded based on file patterns
- Prompts in `.github/prompts/` provide reusable task templates

You can use AI tools while contributing — the config files ensure generated code aligns with project standards.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code. Report unacceptable behavior to the project maintainers.

## Questions?

Open a [GitHub Discussion](https://github.com/and3rn3t/apple-shortcuts-doctor/discussions) or
file an [issue](https://github.com/and3rn3t/apple-shortcuts-doctor/issues). Report security
problems privately as described in the [security policy](SECURITY.md).
