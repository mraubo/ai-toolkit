---
name: code-review
description: Review code changes against team engineering conventions, testing standards and security expectations.
---

# Code Review

Review code against team engineering conventions. Trigger on "review code", "check this PR", "review my changes", or "code review".

## Review categories

Evaluate changes in these areas:

1. **Naming** — descriptive camelCase, verb-first functions, boolean prefixes (`is`, `has`, `should`, `can`), UPPER_SNAKE_CASE constants
2. **Error handling** — try/catch on async work, actionable messages, no empty catch blocks, cleanup in `finally`
3. **TypeScript** — no unjustified `any`, prefer `interface`, use `unknown` + narrowing, discriminated unions for state
4. **Function design** — single responsibility, max 3 params (options object beyond that), early returns, pure query functions
5. **Security** — no secrets in code, validate at boundaries, parameterized SQL, no stack traces in API responses
6. **Testing** — behavior-describing test names, isolated setup/teardown, specific assertions, edge and error paths covered

## Output format

Organize findings by severity:

### Critical
Issues that must be fixed before merge (security, data loss, broken behavior).

### Warning
Likely bugs, maintainability problems, or convention violations.

### Suggestion
Optional improvements that would strengthen the change.

Each finding should include a `file:line` reference when possible.

End with one recommendation: **APPROVE**, **REQUEST CHANGES**, or **NEEDS DISCUSSION**.
