---
name: code-review
description: "Perform a structured code review with a multi-point checklist. Use when reviewing pull requests, auditing code quality, checking for security issues, or evaluating new code."
argument-hint: "Describe the code or area to review"
---
# Code Review Workflow

## When to Use
- Reviewing pull request changes
- Auditing code quality before a release
- Checking new code for security and performance issues
- Evaluating third-party code or dependencies

## Procedure
1. Identify the files that changed or need review
2. For each file, read the code and understand its purpose
3. Run through the [review checklist](./references/checklist.md) systematically
4. Search for related tests — are they adequate?
5. Check for consistency with project conventions
6. Compile findings into a structured report

## Output Format
### Summary
- Overall assessment (Approve / Request Changes / Needs Discussion)
- Number of findings by severity

### Findings
For each issue:
- **Severity**: Critical / Warning / Suggestion / Praise
- **Category**: Correctness / Security / Performance / Style / Testing
- **Location**: File and line
- **Issue**: Clear description
- **Fix**: Specific recommendation

### Recommendations
- Priority order of fixes
- Suggestions for follow-up work
