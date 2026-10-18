---
description: "Use when writing tests, test utilities, or test infrastructure. Covers unit testing patterns, mocking strategies, and test organization."
applyTo: "**/*.{test,spec}.{ts,js,tsx,jsx,py}"
---
# Testing Guidelines

## Structure

- Follow Arrange-Act-Assert (AAA) pattern
- Use descriptive test names: `should [expected behavior] when [condition]`
- Group related tests with `describe`/`context` blocks
- One assertion per test when possible; multiple only for closely related checks

## Test Organization

- Mirror source file structure in test directories
- Co-locate test utilities with the tests that use them
- Shared fixtures go in `__fixtures__/` or `fixtures/` directories
- Test helpers go in `__helpers__/` or `test-utils` files

## Mocking

- Mock at the boundary (APIs, databases, file system), not internal functions
- Prefer dependency injection over module mocking
- Reset mocks between tests to prevent cross-test contamination
- Use fakes/stubs for simple cases; full mocks only when verifying interactions

## Coverage

- Test the happy path, edge cases, and error cases
- Cover boundary conditions (empty inputs, null values, max limits)
- Don't test implementation details — test behavior and outcomes
- Snapshot tests: use sparingly, review changes carefully

## Anti-Patterns to Avoid

- Tests that depend on execution order
- Shared mutable state between tests
- Testing private methods directly
- Overly complex test setup (consider refactoring the code under test)
