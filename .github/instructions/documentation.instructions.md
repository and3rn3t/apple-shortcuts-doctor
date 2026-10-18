---
description: "Use when writing documentation, README files, API docs, code comments, or inline documentation."
applyTo: "**/*.md"
---
# Documentation Guidelines

## Code Comments

- Focus on "why" not "what" — the code shows what, comments explain why
- Document non-obvious business rules and edge cases
- Use JSDoc/docstrings for public APIs with parameter descriptions and return types
- Remove outdated comments; wrong comments are worse than no comments
- Use TODO/FIXME with ticket references: `// TODO(PROJ-123): migrate to v2 API`

## README Structure

- Title and one-line description
- Prerequisites and setup instructions
- How to run, test, and deploy
- Architecture overview for complex projects
- Link to detailed docs rather than embedding everything

## API Documentation

- Document every public endpoint with method, path, parameters, and response shape
- Include request/response examples
- Document error responses and status codes
- Note authentication requirements per endpoint
- Keep API docs next to the code they describe

## Markdown Standards

- Use ATX-style headers (`#`) with a blank line before and after
- Use fenced code blocks with language identifiers
- Keep line length reasonable (100-120 chars) for readability in diffs
- Use relative links for internal references
