# Code Review Checklist

## Correctness

- [ ] Logic handles all expected input types
- [ ] Edge cases covered (null, empty, boundary values)
- [ ] Error handling is appropriate and complete
- [ ] No off-by-one errors in loops/ranges
- [ ] Race conditions prevented in concurrent code
- [ ] Resource cleanup handled (connections, files, timers)

## Security

- [ ] User input is validated and sanitized
- [ ] No SQL/command/template injection possible
- [ ] Authentication checked on protected routes
- [ ] Authorization verified for resource access
- [ ] No sensitive data in logs or error messages
- [ ] No hardcoded secrets or credentials
- [ ] CSRF protection on state-changing endpoints
- [ ] XSS prevention (output encoding, CSP)

## Performance

- [ ] No N+1 query patterns
- [ ] Appropriate database indexes for query patterns
- [ ] No unbounded data fetching (pagination present)
- [ ] Expensive computations are cached or lazy-loaded
- [ ] No memory leaks (event listeners cleaned up, subscriptions unsubscribed)
- [ ] Appropriate use of async/concurrency

## Code Quality

- [ ] Names are clear and descriptive
- [ ] Functions are focused (single responsibility)
- [ ] No unnecessary code duplication
- [ ] Complexity is reasonable (nesting depth, cyclomatic complexity)
- [ ] Comments explain "why" not "what"
- [ ] Dead code removed

## Testing

- [ ] Unit tests for new logic
- [ ] Edge case tests present
- [ ] Error path tests present
- [ ] Test names describe expected behavior
- [ ] No flaky test patterns (timing, ordering, shared state)
- [ ] Mocks are at boundaries, not internal functions

## API Design (if applicable)

- [ ] Consistent with existing API patterns
- [ ] Appropriate HTTP methods and status codes
- [ ] Request validation with clear error messages
- [ ] Response format matches API conventions
- [ ] Breaking changes documented and versioned

## Documentation

- [ ] Public APIs have docstrings/JSDoc
- [ ] Non-obvious logic has explanatory comments
- [ ] README updated for new features/changes
- [ ] Migration guides for breaking changes
