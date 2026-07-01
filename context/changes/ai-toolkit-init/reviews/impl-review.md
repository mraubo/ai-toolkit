<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: ai-toolkit-init Implementation Plan

- **Plan**: context/changes/ai-toolkit-init/plan.md
- **Scope**: All phases (1–4)
- **Date**: 2026-07-01
- **Verdict**: NEEDS ATTENTION (post-triage: all 8 findings addressed)
- **Findings**: 1 critical, 5 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | FAIL |
| Scope Discipline | FAIL |
| Safety & Quality | WARNING |
| Architecture | FAIL |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Rules sentinel-merge shipped despite copy-only guardrail

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Adherence / Scope Discipline
- **Location**: src/rules-merge.js:1, src/install.js:199, src/conflict.js:54
- **Detail**: Plan explicitly forbids sentinel-merge (`What We're NOT Doing` L62; Phase 2 copy-only decision). Implementation adds `src/rules-merge.js`, interactive `[m] Merge/prepend` in conflict.js, and README documents merge behavior.
- **Fix A ⭐ Recommended**: Remove merge path — delete rules-merge usage; conflict options `[s/b/o]` only; align README with copy-only.
  - Strength: Restores plan fidelity; matches propose-unified MVP decision.
  - Tradeoff: Loses merge UX for users with existing AGENTS.md/CLAUDE.md.
  - Confidence: HIGH — plan guardrail is explicit.
  - Blind spot: Stakeholders who already rely on merge in v0.1.x.
- **Fix B**: Amend plan + shape-notes to accept merge as intentional v0.1 scope expansion.
  - Strength: Preserves shipped behavior; documents source of truth.
  - Tradeoff: Scope guardrail becomes moving target; needs merge tests.
  - Confidence: MEDIUM — requires stakeholder sign-off.
  - Blind spot: PHP colleague milestone assumed copy-only.
- **Decision**: FIXED via Fix B — plan amended to accept rules merge as intentional v0.1 scope

### F2 — Global uninstall removes shared home-dir artifacts

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/uninstall.js:36
- **Detail**: Uninstall reads project-local manifest and removes all tracked `dest` paths, including `~/` global paths. Uninstalling from project A can delete `~/.cursor/skills/code-review/` used by projects B/C.
- **Fix A ⭐ Recommended**: Document hazard in README uninstall section; warn when manifest contains global paths.
  - Strength: Low effort; surfaces risk before destructive action.
  - Tradeoff: Does not prevent accidental deletion.
  - Confidence: HIGH.
  - Blind spot: Users who skip README.
- **Fix B**: Filter uninstall by `--scope`; only remove paths matching scope flag.
  - Strength: Safer default for project-only uninstall intent.
  - Tradeoff: Requires CLI flag addition; global-only cleanup needs separate flow.
  - Confidence: MEDIUM — needs UX design for global uninstall.
  - Blind spot: Existing manifests without scope metadata.
- **Decision**: FIXED via Fix A — README warning + runtime warn on global paths in manifest

### F3 — Backup basename collision with `--scope both`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/copy.js:31
- **Detail**: `backupFile` uses `basename(dest)` only. With `--scope both`, project `AGENTS.md` and `~/AGENTS.md` backup to same `…/backups/<ts>/AGENTS.md`; second backup overwrites first.
- **Fix**: Include scope disambiguator in backup path (e.g. `project-AGENTS.md`, `global-AGENTS.md`).
- **Decision**: FIXED — scope-prefixed backup labels in copy.js / install.js

### F4 — Progress 3.4 claims backup test; none exists

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: test/install.test.js
- **Detail**: Plan progress marks 3.4 backup test done (`b33617c`), but `test/install.test.js` has no backup assertion (grep finds zero matches).
- **Fix**: Add test seeding user-owned file, interactive backup path or `--force` with backup trigger via `backup-and-copy` decision mock.
- **Decision**: FIXED — backupFile unit test at `.ai-toolkit/backups/<timestamp>/`

### F5 — setup.sh never rotates stale auth token

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/setup.sh:48
- **Detail**: `append_npmrc_line` skips append if `_authToken` pattern exists. Re-running after `gh auth refresh` leaves expired token in `~/.npmrc`.
- **Fix**: Replace existing `_authToken` line in place when pattern matches, instead of grep-and-skip.
- **Decision**: FIXED — upsert_npmrc_line replaces stale token; chmod 600 on ~/.npmrc

### F6 — `--force` overwrites without backup

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/conflict.js:41
- **Detail**: `--force` returns `{ action: "copy" }` with no backup step. User-modified files are silently destroyed.
- **Fix A ⭐ Recommended**: Auto-backup before `--force` overwrite (same backup dir as interactive backup).
  - Strength: Preserves user data; consistent with backup-on-overwrite intent.
  - Tradeoff: `--force` semantics change slightly (creates backup dirs).
  - Confidence: HIGH.
  - Blind spot: Disk usage on repeated force installs.
- **Fix B**: Document that `--force` is fully destructive; no backup.
  - Strength: No code change.
  - Tradeoff: Data loss risk remains.
  - Confidence: HIGH.
  - Blind spot: Users expect force = overwrite with safety net.
- **Decision**: FIXED via Fix A — --force triggers backup-and-copy for user-owned/modified files

### F7 — Dry-run skips conflicts instead of logging resolution

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/conflict.js:45
- **Detail**: Plan Phase 3 says dry-run logs each planned copy and conflict resolution action. On conflict, dry-run returns `skip` without logging the would-be action.
- **Fix**: In dry-run branch, log planned action (`would skip`, `would backup`, etc.) instead of silent skip.
- **Decision**: FIXED — dry-run logs `(would skip: <state>)` for conflicts

### F8 — Manifest written only after all copies

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Reliability
- **Location**: src/install.js:306
- **Detail**: Crash between copy and `writeManifest` leaves orphaned files with no/unreliable uninstall trail.
- **Fix**: Write manifest incrementally per artifact, or temp manifest + atomic rename at end.
- **Decision**: FIXED — incremental manifest flush + atomic rename in writeManifest
