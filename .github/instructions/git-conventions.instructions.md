---
description: "Use when writing commit messages, creating branches, preparing pull requests, or following git workflow conventions."
---
# Git Conventions

## Commit Messages

- Use conventional commits format: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`
- Keep subject line under 72 characters
- Use imperative mood: "Add feature" not "Added feature"
- Reference issue numbers: `feat(auth): add OAuth2 login (#123)`

## Branch Naming

- Format: `type/short-description` or `type/ISSUE-123-short-description`
- Types: `feature/`, `fix/`, `hotfix/`, `chore/`, `docs/`, `refactor/`
- Use kebab-case: `feature/user-authentication`
- Keep names short but descriptive

## Pull Requests

- Write a clear title following conventional commit format
- Include a description of what changes and why
- Link related issues
- Keep PRs focused — one logical change per PR
- Add screenshots/recordings for UI changes
- Request reviews from relevant team members
