---
name: code-review
description: Structured code review with severity-calibrated findings, confidence gating, and actionable output. Trigger with a PR URL, diff, file path, or "review this before I merge", "is this code safe?", or when checking for N+1 queries, injection risks, missing edge cases, or error handling gaps. Supports focus areas like "focus on security" or "this handles PII".
argument-hint: "<PR URL, diff, file path, or blank for current branch> [focus:security|performance|correctness|all]"
---

## Usage

```text
/code-review <PR URL, diff, or file path> [focus:security]
/code-review                              (reviews current branch)
```

Review the provided code changes: @$1

If no specific file, URL, or diff is provided, review the current branch against its base.

## Severity Scale

All findings use P0–P3 with calibrated definitions:

| Level | Meaning | Action |
| ----- | ------- | ------ |
| **P0** | Critical breakage, exploitable vulnerability, data loss/corruption | Must fix before merge |
| **P1** | High-impact defect likely hit in normal usage, breaking contract | Should fix before merge |
| **P2** | Moderate issue with meaningful downside (edge case, perf regression, maintainability trap) | Fix if straightforward |
| **P3** | Low-impact, narrow scope, minor improvement | Author's discretion |

## Confidence Anchors

Each finding carries a confidence anchor — how certain the reviewer is that the finding is real and correctly diagnosed:

| Anchor | Meaning |
| ------ | ------- |
| **100** | Verified against code — the issue is provably present |
| **75** | High confidence from diff context — strong evidence, minor ambiguity |
| **50** | Moderate — plausible from the diff but context may be missing |
| **25** | Speculative — pattern-matched, needs author confirmation |

Only findings at confidence 75+ appear in the final report. Exception: P0 findings at 50+ always survive — critical-but-uncertain issues must not be silently dropped.

## Review Dimensions

### Security

- SQL/NoSQL injection, XSS, CSRF
- Authentication and authorization flaws (missing ownership checks, privilege escalation)
- Secrets, credentials, or tokens in code
- Insecure deserialization, path traversal, SSRF
- Open redirects, CORS misconfiguration
- Dependency vulnerabilities (known CVEs in added packages)

### Performance

- N+1 queries, missing eager loading
- Unnecessary memory allocations or copies in hot paths
- Algorithmic complexity (O(n²) where O(n) or O(n log n) is feasible)
- Missing database indexes for new query patterns
- Unbounded queries, loops, or pagination
- Resource leaks (unclosed connections, file handles, streams)
- Missing caching opportunities for repeated expensive operations

### Correctness

- Edge cases (empty input, null/nil/undefined, overflow, boundary values)
- Race conditions and concurrency issues (shared mutable state, TOCTOU)
- Error handling — swallowed exceptions, missing rollback, inconsistent error propagation
- Off-by-one errors, fencepost issues
- Type safety gaps, implicit coercions
- State machine invariants broken by new transitions
- Contract violations (preconditions, postconditions, API guarantees)

### Maintainability

- Naming clarity — do names reveal intent?
- Single responsibility — does one change do one thing?
- Duplication — is the same logic expressed in multiple places?
- Test coverage — are new paths exercised? Are edge cases tested?
- Complexity — cyclomatic/cognitive complexity in new or modified functions
- Dead code — unused imports, unreachable branches, commented-out blocks

## How to Run

### Stage 1: Determine Scope

Acquire the diff and understand the change boundaries.

**If a PR URL or number is provided:**

```bash
gh pr diff <url-or-number> --color=never
gh pr view <url-or-number> --json title,body,baseRefName,headRefName,files --jq '{title, body, baseRefName, headRefName, files: [.files[].path]}'
```

Use PR title, body, and metadata as context for intent.

**If a file path or diff is provided:**

Read the file or diff directly. If a file path is given, diff it against the base branch:

```bash
git diff HEAD -- <file-path>
```

**If no argument (current branch):**

Detect the base branch and diff against it:

```bash
BASE=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD origin/master 2>/dev/null)
git diff --name-only $BASE
git diff -U10 $BASE
```

If the branch has an open PR, prefer fetching scope from it via `gh pr view`.

**If no diff can be produced** (no changes, wrong path, empty branch), stop and tell the user — do not fabricate findings.

### Stage 2: Intent Discovery

Before reviewing, understand what the change is trying to accomplish. The quality of a review depends on understanding intent — a "bug" might be intentional behavior, a "missing check" might be handled upstream.

Sources of intent (in priority order):

1. PR title and body (when available)
2. Commit messages: `git log --oneline ${BASE}..HEAD`
3. Branch name semantics (e.g., `fix/null-check`, `feat/user-export`)
4. User-provided context ("this handles PII", "this is a hot path")

Write a 1–3 line intent summary:

```text
Intent: Add CSV export for user data with pagination support.
Must handle large datasets without OOM. PII fields must be masked in export.
```

Intent shapes how hard to look — a payment flow gets deeper security scrutiny than a test utility rename.

**When intent is ambiguous:** Infer the best-effort summary and note uncertainty in the Coverage section. Never block on a clarifying question — review what you can see.

### Stage 3: Focus Selection

Decide which dimensions to emphasize:

- If the user specified `focus:security`, `focus:performance`, etc. — prioritize that dimension but do not skip others entirely (a P0 in any dimension always surfaces).
- If no focus is specified, weight dimensions by the change type:
  - New endpoints / auth changes → heavier security
  - Database / query changes → heavier performance
  - Business logic changes → heavier correctness
  - Refactors / renames → heavier maintainability

### Stage 4: Deep Review

For each file in the diff:

1. **Read the surrounding code** — not just the diff hunks. A finding that ignores context above or below the change is a false positive waiting to happen. Check at minimum 20 lines above and below each changed hunk.
2. **Trace call sites** — for changed functions, check who calls them and whether callers' assumptions still hold.
3. **Check error paths** — follow each error/exception to see if it's handled, propagated, or swallowed.
4. **Verify test coverage** — are new branches and edge cases exercised in tests?

For each issue found, record:

- **Title** — one terse clause (the scannable index)
- **File and line** — verified against actual file content
- **Severity** — P0/P1/P2/P3, calibrated against the scale
- **Confidence** — 100/75/50/25, based on how much context you verified
- **Category** — Security / Performance / Correctness / Maintainability
- **Suggested fix** — concrete code suggestion when possible, not "consider improving"
- **Pre-existing** — whether this issue existed before the current change (true/false)

### Stage 5: Filter and Deduplicate

1. **Separate pre-existing issues.** Issues that existed before this change go into a separate section — they don't count toward the verdict but are worth noting.
2. **Confidence gate.** Suppress findings below confidence 75, except P0 at 50+.
3. **Deduplicate.** If the same root cause manifests in multiple lines, merge into one finding pointing to the primary location.
4. **Skip linter territory.** Don't flag things the project's linter/formatter would catch (missing semicolons, wrong indentation, import order). Focus on semantic issues.
5. **Sort.** Order by severity (P0 first) → confidence (descending) → file path → line number. Assign stable `#` values.

### Stage 6: Validate Findings

Before presenting, verify each surviving finding:

1. **Is the line number correct?** Re-check cited line against file content. A finding pointing at the wrong line is worse than no finding.
2. **Is it actually a bug?** Verify the issue isn't handled elsewhere — by a caller guard, a middleware, a framework default, a type constraint, or another branch in the same function.
3. **Is the severity right?** A style nit is never P0. A SQL injection is never P3.
4. **Is the fix actionable?** If a finding says "consider", "might want to", or "could be improved" without a concrete action — rewrite it with a specific fix or demote to P3.
5. **Does it duplicate linter output?** Remove it.

Drop or adjust findings that fail validation. Record dropped count in Coverage.

## Output

Present the review in this exact structure:

```markdown
## Code Review: [PR title or file]

### Scope
- **Branch:** [branch name]
- **Base:** [base branch or commit]
- **Files changed:** [count]
- **Intent:** [1-3 line intent summary]
- **Focus:** [dimensions emphasized]

### P0 — Critical
| # | File | Issue | Category | Confidence |
|---|------|-------|----------|------------|
| 1 | `path/file.go:42` | Terse one-line description | Security | 100 |

- **#1** — Full explanation: why this matters, what can go wrong, and concrete fix direction with code example when helpful.

### P1 — High
| # | File | Issue | Category | Confidence |
|---|------|-------|----------|------------|

- **#N** — Detail line for complex findings.

### P2 — Moderate
[same table shape]

### P3 — Low
[same table shape]

(Omit empty severity levels.)

### Pre-existing Issues
| # | File | Issue | Category | Note |
|---|------|-------|----------|------|
| - | `path/file.go:10` | Description | Performance | Was present before this change |

(Omit if none.)

### What Looks Good
- [Specific positive observations — good patterns, solid test coverage, clean abstractions]
- [Be concrete, not generic. "Good error handling in parseConfig with typed errors and rollback" > "Nice code"]

### Actionable Summary

Findings requiring action before merge:

| # | Severity | File | Issue | Fix available |
|---|----------|------|-------|---------------|
| 1 | P0 | `file:42` | Terse title | Yes |

(When empty: "No actionable findings — ready to merge.")

### Coverage
- Findings suppressed (below confidence 75): [count]
- Pre-existing issues: [count]
- Validation drops: [count and brief reasons]
- Unreviewed areas: [files or paths not covered and why]

---

### Verdict: [Approve / Approve with fixes / Request changes]
[1-2 sentence reasoning. Reference finding #s that drive the verdict.]
[If "Approve with fixes" — state fix priority order.]
```

### Output Rules

These shapes are forbidden — if you catch one, re-render:

- `Field:`-prefixed blocks instead of table rows (`#:` / `File:` / `Issue:`)
- Per-row separators (`────`, `———`)
- A table replaced by a plain bulleted list
- Inconsistent formatting across severity levels

The `Issue` column stays terse — one short clause (~12 words max). Depth goes in the keyed detail line (`- **#N** — …`), not packed into the cell.

## Quality Gates (self-check before delivery)

Before presenting the review, verify:

1. **Every finding is actionable.** Vague "consider" language → rewrite with specific fix or demote.
2. **No false positives from skimming.** Each finding's surrounding code was actually read and the issue isn't handled elsewhere.
3. **Severity is calibrated.** Style nit ≠ P0. SQL injection ≠ P3.
4. **Line numbers are accurate.** Verified against file content.
5. **Findings don't duplicate linter output.** Semantic issues only.
6. **Positive observations are concrete.** "Good error handling in X" > "Nice code".
7. **Verdict matches findings.** P0 present → never "Approve". Zero actionable → never "Request changes".

## Tips for Users

1. **Provide context** — "This is a hot path" or "This handles PII" or "This runs in a cron every 5 min" helps focus the review on what matters.
2. **Specify focus** — `focus:security` narrows the review depth. Everything else still gets a pass, but the focused dimension gets thorough treatment.
3. **Include test files** — reviewing tests alongside production code catches coverage gaps and fragile assertions.
4. **Mention constraints** — "Must be backward compatible" or "Can't add new dependencies" prevents irrelevant suggestions.
