---
name: testing-workflow
description: "Run a comprehensive testing workflow including test creation, execution, coverage analysis, and quality improvement. Use for adding tests to untested code, improving coverage, or fixing flaky tests."
argument-hint: "Describe what needs testing or the testing goal"
---
# Testing Workflow

## When to Use
- Adding tests to untested or under-tested code
- Improving test coverage for a module or feature
- Debugging and fixing flaky tests
- Setting up test infrastructure for a new project

## Procedure

### Adding Tests to Existing Code
1. Identify the code to test — read it to understand all code paths
2. Search for existing test patterns in the project:
   - Test framework and assertion library
   - File naming conventions (`*.test.ts`, `*.spec.py`, etc.)
   - Common test utilities and fixtures
3. Reference the [testing patterns guide](./references/patterns.md)
4. Write tests following priority order:
   a. Happy path — normal expected usage
   b. Error paths — what should fail and how
   c. Edge cases — boundary values, empty inputs, nulls
   d. Integration points — API calls, database queries
5. Run the tests and verify they pass
6. Check coverage and identify remaining gaps

### Fixing Flaky Tests
1. Identify the flaky test and its failure pattern
2. Common causes:
   - Timing dependencies (use explicit waits, not sleep)
   - Shared state between tests (isolate with setup/teardown)
   - Network dependencies (mock external calls)
   - Order dependencies (tests should be independent)
3. Fix the root cause, not the symptom
4. Run the test multiple times to verify stability

## Output
- Test files following project conventions
- Coverage report highlighting remaining gaps
- Summary of what's tested and what still needs coverage
