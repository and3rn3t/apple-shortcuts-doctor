---
description: "Generate comprehensive test cases for selected code including edge cases, error scenarios, and boundary conditions"
agent: "agent"
argument-hint: "Describe the code or paste a function to generate tests for"
---
Generate comprehensive test cases for the provided code:

1. **Analyze** the code to identify all code paths, edge cases, and potential failure points
2. **Follow** existing test patterns in the codebase — search for nearby test files first
3. **Include** these test categories:
   - Happy path: normal expected usage
   - Edge cases: empty inputs, boundary values, max/min limits
   - Error cases: invalid inputs, missing data, network failures
   - Type edge cases: null, undefined, empty strings, zero values
4. **Name** tests descriptively: `should [expected behavior] when [condition]`
5. **Use** Arrange-Act-Assert pattern
6. **Mock** external dependencies at boundaries (APIs, databases, file system)

Place the test file next to the source file or in the matching test directory structure.
