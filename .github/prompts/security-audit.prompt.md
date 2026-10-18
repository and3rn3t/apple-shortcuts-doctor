---
description: "Perform a security audit on code, checking for OWASP Top 10 vulnerabilities and security best practices"
agent: "agent"
argument-hint: "Describe the code or area to audit"
---
Perform a security audit of the provided code.

## OWASP Top 10 Checklist
1. **Broken Access Control**: Missing authorization checks, IDOR vulnerabilities, privilege escalation
2. **Cryptographic Failures**: Weak algorithms, hardcoded keys, sensitive data exposure
3. **Injection**: SQL, NoSQL, OS command, LDAP, XSS injection points
4. **Insecure Design**: Missing rate limiting, business logic flaws, trust boundary violations
5. **Security Misconfiguration**: Default credentials, unnecessary features, verbose errors
6. **Vulnerable Components**: Outdated dependencies, known CVEs
7. **Auth Failures**: Weak passwords, missing MFA, session fixation, credential stuffing
8. **Data Integrity Failures**: Deserialization issues, missing integrity checks
9. **Logging Failures**: Missing audit trails, logging sensitive data, insufficient monitoring
10. **SSRF**: Unvalidated URLs, internal network access from user input

## Output Format
For each finding:
- **Severity**: Critical / High / Medium / Low / Informational
- **Category**: OWASP category
- **Location**: File and line
- **Description**: What the vulnerability is
- **Impact**: What could happen if exploited
- **Remediation**: How to fix it with code example
- **References**: CWE ID or relevant documentation

Prioritize findings by severity and ease of exploitation.
