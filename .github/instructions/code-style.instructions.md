---
description: "Use when writing or modifying source code. Covers naming conventions, formatting, code organization, and idiomatic patterns."
applyTo: "**/*.{ts,js,tsx,jsx,py,java,go,rs,cs,rb,swift,kt}"
---
# Code Style Guidelines

## Naming

- Variables and functions: `camelCase` (JS/TS/Java), `snake_case` (Python/Rust/Ruby/Go)
- Classes and types: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Boolean variables: prefix with `is`, `has`, `should`, `can`
- Event handlers: prefix with `handle` or `on`

## Functions

- Keep functions focused on a single responsibility
- Limit to 30 lines; extract helpers for complex logic
- Use early returns to reduce nesting depth
- Prefer pure functions where possible
- Use descriptive parameter names; avoid abbreviations

## Error Handling

- Handle errors explicitly at every layer
- Use typed errors/exceptions with meaningful messages
- Include context in error messages: what failed and why
- Never swallow exceptions silently (`catch {}`)
- Use Result/Either types for expected failure cases where available

## Code Organization

- Group related functions and types together
- Order: exports/public → private helpers → types → constants
- Keep imports organized: external → internal → relative
- One class/component per file as a default
