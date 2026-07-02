---
name: pr-review
description: Structured pull request review prompt for security, correctness, and maintainability
---

# Pull Request Review

Review this pull request as a senior engineer. Focus on:

1. **Correctness** — logic bugs, edge cases, off-by-one, race conditions
2. **Security** — injection, auth boundaries, secrets, unsafe defaults
3. **Maintainability** — naming, duplication, test coverage for changed behavior
4. **API / UX** — breaking changes, error messages, backward compatibility

## Output format

Group findings by severity:

- **Critical** — must fix before merge
- **Warning** — should fix or justify
- **Suggestion** — optional improvement

For each finding: file/location, issue, recommended fix.
