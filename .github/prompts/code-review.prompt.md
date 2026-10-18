---
description: "Perform a thorough code review checking for bugs, security issues, performance problems, and code quality"
agent: "agent"
argument-hint: "Describe the code changes or files to review"
---
Perform a thorough code review of the provided code. Check for:

## Correctness
- Logic errors, off-by-one errors, race conditions
- Unhandled edge cases (null, empty, boundary values)
- Incorrect error handling or swallowed exceptions

## Security
- SQL injection, XSS, command injection vulnerabilities
- Hardcoded secrets or credentials
- Missing input validation at boundaries
- Improper authentication/authorization checks

## Performance
- N+1 queries, unnecessary re-renders, memory leaks
- Missing indexes for database queries
- Unbounded data fetching without pagination
- Expensive operations in hot paths

## Code Quality
- Naming clarity and consistency
- Function complexity and length
- Code duplication
- Missing or misleading comments

## Output Format
For each finding, provide:
- **Severity**: Critical / Warning / Suggestion
- **Location**: File and line
- **Issue**: What's wrong
- **Fix**: Specific recommendation with code example
