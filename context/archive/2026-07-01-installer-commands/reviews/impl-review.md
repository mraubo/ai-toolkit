<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: installer-commands

- **Plan**: context/changes/installer-commands/plan.md
- **Scope**: All 4 phases
- **Date**: 2026-07-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING ⚠️ |
| Scope Discipline | PASS ✅ |
| Safety & Quality | WARNING ⚠️ |
| Architecture | PASS ✅ |
| Pattern Consistency | WARNING ⚠️ |
| Success Criteria | PASS ✅ |

## Findings

### F1 — `update` reinstalls full catalog, not manifest-tracked artifacts

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Adherence
- **Location**: src/update.js:26-45
- **Detail**: Plan requires inferring `--skill` / `--rule` / `--prompt` from `manifest.files[].src`. Implementation only forwards `agents` and `scope`; `install()` defaults to all bundled artifacts. A prior `--skill code-review` install gets rules/prompts added on `update --yes`.
- **Fix A ⭐ Recommended**: Derive granular flags from manifest `src` paths before calling `install()`
  - Strength: Matches plan contract; preserves selective-install intent across updates.
  - Tradeoff: Requires mapping `content/skills/…`, `content/rules/…`, `content/prompts/…` back to flag values.
  - Confidence: HIGH — manifest `src` paths are already recorded at install time.
  - Blind spot: Mixed-scope manifests with partial categories need edge-case handling.
- **Fix B**: Document as known behavior; add `--full` flag for explicit full-catalog sync
  - Strength: Minimal code change; current behavior may suit teams wanting full sync.
  - Tradeoff: Plan drift remains; selective installs are not preserved silently.
  - Confidence: MEDIUM — depends on user expectations.
  - Blind spot: README does not currently document this behavior.
- **Decision**: FIXED via Fix A

### F2 — `inferScope` uses unsafe path prefix matching

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/update.js:12-18
- **Detail**: `dest.startsWith(target)` misclassifies `/tmp/myproject-extra/…` as project-scoped when target is `/tmp/myproject`. `uninstall.js` already uses boundary-safe `${base}${sep}` prefix checks via `isOutsideTarget()`.
- **Fix**: Reuse boundary-safe prefix logic from `uninstall.js` (export or duplicate `isUnderPath(dest, base)`).
- **Decision**: FIXED (applied with F1 in `src/update.js`)

### F3 — Corrupt manifest JSON crashes commands

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/manifest.js:18
- **Detail**: `readManifest()` calls `JSON.parse()` without try/catch. Corrupted `.ai-toolkit/manifest.json` throws in `doctor`, `update`, `list --installed`, and `uninstall` instead of a graceful error.
- **Fix**: Wrap `JSON.parse` in try/catch; return `null` or throw a descriptive `ai-toolkit: invalid manifest` error consistent with missing-manifest handling.
- **Decision**: FIXED — throws descriptive error on parse failure

### F4 — Planned unit test suites missing

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: test/ (N/A)
- **Detail**: Plan Testing Strategy lists unit tests for `artifacts.js` filter logic, `auth-check.js` token detection, and `agents.js` Codex path resolution. Only integration tests exist.
- **Fix A ⭐ Recommended**: Add focused unit test files (`test/artifacts.test.js`, etc.)
  - Strength: Catches edge cases (unknown rule names, `cursor/` prefix rules) without full install round-trips.
  - Tradeoff: More test files to maintain.
  - Confidence: HIGH — plan explicitly called these out.
  - Blind spot: Diminishing returns if integration tests already cover happy paths.
- **Fix B**: Accept integration-only coverage; update plan Testing Strategy to reflect reality
  - Strength: No new test code; integration tests pass (23/23).
  - Tradeoff: Edge cases in `resolveRuleSelection` and auth-check remain untested.
  - Confidence: MEDIUM.
  - Blind spot: Future regressions in filter logic harder to isolate.
- **Decision**: FIXED via Fix A — added test/artifacts.test.js, test/auth-check.test.js, test/agents.test.js

### F5 — Missing integration tests for `list --installed` and selective `update`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: test/commands.test.js (N/A)
- **Detail**: `list --installed` has no automated test. No test for `update` after `--skill`-only install (would catch F1).
- **Fix**: Add two tests to `test/commands.test.js`: `list --installed` after install shows ✓ markers; `update` after skill-only install does not add rules.
- **Decision**: FIXED — both tests added to test/commands.test.js

### F6 — Postinstall always installs all agents

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: scripts/postinstall.js:18
- **Detail**: Uses `--agent all --scope project`, writing Claude, Cursor, and Codex paths even in single-agent projects. Plan contract specifies this explicitly, but README could surprise Cursor-only teams.
- **Fix**: Document prominently in README auto-install section (already partially documented); optionally use `detectAgents(INIT_CWD)` with `all` fallback.
- **Decision**: FIXED — README documents all-agents behavior explicitly
