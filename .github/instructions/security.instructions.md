---
description: "Use when handling authentication, authorization, user input validation, data encryption, API security, or any security-sensitive code."
applyTo: ["**/auth/**", "**/security/**", "**/middleware/**"]
---
# Security Guidelines

## Input Validation

- Validate all user input at system boundaries (API endpoints, form handlers)
- Use allowlists over denylists for input validation
- Sanitize data before rendering to prevent XSS
- Validate file uploads: check type, size, and content
- Never trust client-side validation alone

## Authentication & Authorization

- Use established libraries (passport, next-auth, etc.) — don't roll your own
- Implement proper session management with secure, HttpOnly cookies
- Use RBAC or ABAC for authorization; check permissions on every request
- Rate-limit authentication endpoints
- Implement account lockout after failed attempts

## Data Protection

- Use parameterized queries for all database operations
- Never interpolate user input into SQL, commands, or templates
- Encrypt sensitive data at rest and in transit
- Never log tokens, passwords, API keys, or PII
- Use environment variables for secrets; never commit them to source

## API Security

- Validate and sanitize all request parameters
- Implement proper CORS configuration
- Use CSRF tokens for state-changing operations
- Set appropriate security headers (Content-Security-Policy, X-Frame-Options)
- Version APIs and deprecate securely

## Dependency Management

- Keep dependencies up to date; audit regularly
- Use lockfiles for reproducible builds
- Review new dependencies before adding (check maintenance, popularity, security)
