# installer-commands Implementation Plan

## Overview

Extend `@mraubo/ai-toolkit` from MVP (`install` / `uninstall` for Claude + Cursor) with post-MVP capabilities deferred in the init plan: **Codex agent**, **`list` / `doctor` / `update`**, **granular `--skill` / `--rule` / `--prompt`**, **prompts as a first-class content category**, and **opt-in `postinstall` auto-install**. Builds on the existing copy-mode installer, `tools.json` matrix, and `.ai-toolkit/manifest.json`.

Target release: **`v0.2.0`** (minor — new commands and agent, backward-compatible manifest).

## Current State Analysis

**What exists (v0.1.2):**

- `bin/cli.js` — dispatches `install`, `uninstall` only
- `tools.json` — `claude` + `cursor` with `skills_dir`, `rules_file` (project + global)
- `src/install.js` — copies **all** skills + agent-specific rules; no artifact filtering
- `src/agents.js` — `resolveTarget(agent, scope, "skills"|"rules", baseDir)` only
- `content/` — `skills/code-review/`, `rules/AGENTS.md`, `rules/CLAUDE.md`
- `src/manifest.js` — per-file entries `{ src, dest, hash, agent }`
- Tests — install/uninstall round-trip, conflicts, dry-run (`test/install.test.js`)

**What's missing (from init plan §What We're NOT Doing):**

- Codex in `tools.json` and install routing
- `list`, `doctor`, `update` subcommands + `src/auth-check.js`
- `--skill`, `--rule`, `--prompt` flags
- `content/prompts/` and install paths (Claude commands, Cursor prompts)
- `postinstall` hook (MVP explicitly avoided silent installs)
- `.mdc` cursor rules (`content/rules/cursor/*.mdc` → `.cursor/rules/`) — in propose-unified Faza 2; include as part of `--rule` scope

### Key Discoveries:

- `propose-unified.md` defines the target CLI surface and artifact matrix — use as authoritative design
- Codex official paths (verified Jul 2026): skills → `.agents/skills/<name>/` (project), `~/.agents/skills/` (global); rules → `AGENTS.md` (repo root) per [Codex customization docs](https://developers.openai.com/codex/concepts/customization). Legacy `~/.codex/skills/` exists but **`.agents/skills/` is canonical**
- Codex has **no confirmed native prompts directory** — prompts for Codex are **out of scope** for this change; document as known gap. Claude → `.claude/commands/`, Cursor → `.cursor/prompts/`
- MVP `install.js` hardcodes `RULES_BY_AGENT` and iterates all skills — granular flags require a shared **artifact resolver** module
- `postinstall` must be **opt-in** (env-gated) to preserve MVP safety: no surprise writes on `npm install`

## Desired End State

After this plan completes:

1. `@mraubo/ai-toolkit@0.2.0` published with expanded CLI:

   ```bash
   ai-toolkit install [--agent claude,cursor,codex|all] [--skill <n>] [--rule <n>] [--prompt <n>] ...
   ai-toolkit list [--installed]
   ai-toolkit doctor [--target <path>]
   ai-toolkit update [--yes] [--force] ...
   ```

2. Codex install works: `.agents/skills/code-review/` + `AGENTS.md` in project scope
3. `content/prompts/` ships at least one starter prompt; installs to Claude/Cursor native paths when `--prompt` used or default all
4. `doctor` reports Node version, GH Packages auth, manifest version vs package version, per-file hash drift
5. `update` re-syncs manifest-tracked artifacts from bundled content (same conflict rules as install)
6. `postinstall` runs install **only** when `AI_TOOLKIT_AUTO_INSTALL=1` is set in the consumer environment
7. README documents all new commands and flags

**Verification:** From a temp project, `node bin/cli.js install --agent codex --scope project --yes` creates `.agents/skills/code-review/SKILL.md` + `AGENTS.md`; `doctor` passes; `list` shows bundled catalog; `update --yes` is idempotent on unchanged content.

## What We're NOT Doing

- Codex prompt installation (no verified native path)
- `curl | bash` non-Node distribution (v2)
- AWS CodeArtifact path
- Cursor skill deduplication across `.cursor/` + `.agents/` (optional optimization later)
- Sentinel-merge for `.mdc` rules (copy-only, same as skills)
- Default-on `postinstall` without env gate
- Breaking manifest schema migration (additive `type` field optional only)

## Implementation Approach

Extend the modular layout — **no rewrite**. Add thin command modules (`list.js`, `doctor.js`, `update.js`, `auth-check.js`, `artifacts.js`) and refactor `install.js` to delegate artifact enumeration + destination mapping to `artifacts.js` + extended `agents.js`.

`update` is **`install` with manifest-aware defaults**: same copy pipeline, pre-select agents/skills/rules/prompts from existing manifest when flags omitted, bump `manifest.version` to package version.

`tools.json` gains optional keys per agent target: `prompts_dir`, `commands_dir`, `rules_dir` (for `.mdc`). `agents.js` grows `resolveTarget(agent, scope, artifactType)` where `artifactType` ∈ `skills | rules | prompts | commands | rules_dir`.

## Critical Implementation Details

**Timing & lifecycle:** `postinstall` must read `INIT_CWD` (npm ≥ 7) as install target when the package is a dependency; fall back to `process.cwd()`. Skip entirely when `npm_lifecycle_event` is not `postinstall` or env gate is unset.

**User experience spec:** `list` without flags prints bundled catalog grouped by type. `list --installed` reads manifest and annotates installed vs missing. `doctor` exits `0` on success, `1` when actionable issues found (useful in CI smoke).

## Phase 1: Codex Agent + Extended Path Matrix

### Overview

Add Codex to `tools.json` and teach `agents.js` / `install.js` to route skills and rules to Codex-native paths.

### Changes Required:

#### 1. Codex agent matrix

**File**: `tools.json`

**Intent**: Register Codex CLI with detect markers and project/global targets per OpenAI docs.

**Contract**: New top-level `codex` key: `detect: ["AGENTS.md", ".codex/", ".agents/"]`; project `skills_dir: ".agents/skills"`, `rules_file: "AGENTS.md"`; global `skills_dir: "~/.agents/skills"`, `rules_file: "~/AGENTS.md"`. Reuse `content/rules/AGENTS.md` source (same file as Cursor rules).

#### 2. Artifact type resolution

**File**: `src/agents.js`

**Intent**: Support additional artifact types without hardcoding paths in `install.js`.

**Contract**: Extend `resolveTarget(agent, scope, artifactType, baseDir)` — `artifactType` values: `skills` (maps `skills_dir`), `rules` (maps `rules_file`), plus passthrough for future types. Unknown agent or type throws descriptive error. Export `getRulesSourceFile(agent)` → `"CLAUDE.md"` | `"AGENTS.md"`.

#### 3. Install routing for Codex

**File**: `src/install.js`

**Intent**: Install to Codex when `--agent codex` or detected / `all`.

**Contract**: Replace inline `RULES_BY_AGENT` with `getRulesSourceFile()`. Codex skills land under `.agents/skills/<skillName>/`. Manifest entries use `agent: "codex"`. Interactive agent list includes Codex name from `tools.json`.

#### 4. CLI usage + package metadata

**File**: `bin/cli.js`, `package.json`

**Intent**: Document Codex in help text; bump description to mention Codex.

**Contract**: Usage lists `codex` in `--agent` help. Description string includes "Codex".

#### 5. Codex install test

**File**: `test/install.test.js`

**Intent**: Regression test for Codex project-scope install.

**Contract**: New test: `--agent codex --scope project --yes` creates `.agents/skills/code-review/SKILL.md`, `AGENTS.md`, valid manifest with `codex` agent.

### Success Criteria:

#### Automated Verification:

- `npm test` passes including new Codex install test
- `node --check` on all `src/` and `bin/` files

#### Manual Verification:

- Interactive install detects Codex when `.codex/` or `AGENTS.md` present
- Codex skill visible in Codex CLI skill picker after install

**Implementation Note**: Pause for manual Codex verification before Phase 2.

---

## Phase 2: `list`, `doctor`, `update` Commands

### Overview

Ship operational CLI commands for catalog visibility, health checks, and version sync.

### Changes Required:

#### 1. Auth checker

**File**: `src/auth-check.js`

**Intent**: Reusable GH Packages auth probe for `doctor`.

**Contract**: Export `checkAuth()` → `{ ok, registry, message }`. Verify `@mraubo:registry` in `~/.npmrc` and token line present; optionally probe `gh auth status` for `read:packages` scope when `gh` on PATH. Non-fatal warnings when `gh` missing.

#### 2. List command

**File**: `src/list.js`

**Intent**: Show bundled artifact catalog and optional installed state.

**Contract**: Export `list(flags)`. Scan `content/skills/`, `content/rules/` (files + `cursor/` subdir), `content/prompts/` (Phase 3 may add prompts — stub empty gracefully). Flags: `--installed` reads manifest at `--target` and marks entries ✓/✗ by hash match. Output: grouped sections, package version header.

#### 3. Doctor command

**File**: `src/doctor.js`

**Intent**: One-shot health report for developers and CI.

**Contract**: Export `doctor(flags)`. Checks: Node `>=20`, auth (`checkAuth`), manifest presence at target, `manifest.version` vs package version, per-file drift (dest hash ≠ manifest hash), orphaned manifest entries (dest missing). Print ✅/⚠️/❌ lines; `process.exit(1)` if any ❌.

#### 4. Update command

**File**: `src/update.js`

**Intent**: Re-install from current package version using existing conflict/manifest logic.

**Contract**: Export `update(flags)`. If manifest missing, print hint to run `install` and exit `1`. Otherwise call shared install pipeline with: agents from manifest (unless `--agent` override), all manifest-tracked artifact names inferred from `src` paths, `--yes` default true when TTY missing. Updates `manifest.version` and `installedAt`.

#### 5. CLI dispatcher

**File**: `bin/cli.js`

**Intent**: Wire new subcommands.

**Contract**: Dispatch `list`, `doctor`, `update`; extend `printUsage()` with one-line descriptions.

#### 6. Command tests

**File**: `test/list.test.js`, `test/doctor.test.js`, `test/update.test.js` (or extend `install.test.js`)

**Intent**: Automated coverage for new commands.

**Contract**: `list` outputs `code-review`; `doctor` on fresh project reports no manifest (warning, not fail); after install, `doctor` passes; `update --yes` idempotent on unchanged content.

### Success Criteria:

#### Automated Verification:

- `npm test` passes all new command tests
- `node bin/cli.js list` exits 0 and lists `code-review`

#### Manual Verification:

- `doctor` on misconfigured `~/.npmrc` prints actionable `gh auth refresh` hint
- `update` after editing bundled content locally (dev) refreshes hashes in manifest

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Granular Selection + Prompts + Cursor Rules

### Overview

Allow selective install of skills, rules, and prompts; add `content/prompts/` and optional `.mdc` rules.

### Changes Required:

#### 1. Artifact catalog module

**File**: `src/artifacts.js`

**Intent**: Single source for enumerating and filtering installable artifacts.

**Contract**: Export `listBundledArtifacts(contentDir)` → `{ skills: string[], rules: string[], prompts: string[], mdcRules: string[] }`. Export `resolveArtifacts(flags, contentDir, defaults)` applying `--skill`, `--rule`, `--prompt` (comma-separated, repeatable). Default when flags omitted: all artifacts. Validate names exist; throw on unknown.

#### 2. Install refactor

**File**: `src/install.js`

**Intent**: Use `artifacts.js` instead of copying everything.

**Contract**: Replace `listSkillNames()` loop with filtered artifact sets. Rules: `CLAUDE.md` / `AGENTS.md` by agent; `.mdc` files from `content/rules/cursor/*.mdc` → `.cursor/rules/<basename>` when cursor selected and rule filter includes `cursor/*` or `--rule all`. Prompts: `content/prompts/<n>.md` → Claude `.claude/commands/<n>.md`, Cursor `.cursor/prompts/<n>.md`; skip Codex. Manifest `src` paths reflect `content/prompts/...`.

#### 3. CLI flags

**File**: `src/args.js`, `bin/cli.js`

**Intent**: Parse granular selectors.

**Contract**: `--skill`, `--rule`, `--prompt` accept comma-separated values; document in usage. `--rule code-review` invalid; `--rule AGENTS.md` or `--rule typescript` for mdc basename.

#### 4. Starter content

**File**: `content/prompts/pr-review.md`, optionally `content/rules/cursor/typescript.mdc`

**Intent**: Proof artifacts for new categories.

**Contract**: `pr-review.md` — frontmatter `name`, `description`; body is reusable PR review prompt. `typescript.mdc` — Cursor rule frontmatter + TypeScript conventions (minimal stub).

#### 5. Extended tools.json prompt paths

**File**: `tools.json`

**Intent**: Declarative prompt destinations per agent.

**Contract**: Claude targets: `commands_dir: ".claude/commands"` / `~/.claude/commands`. Cursor targets: `prompts_dir: ".cursor/prompts"` / `~/.cursor/prompts`. Codex: omit (no prompts). `agents.js` handles `commands` and `prompts` artifact types.

#### 6. Manifest type field (optional)

**File**: `src/manifest.js`, install manifest writers

**Intent**: Aid `list --installed` and `doctor` readability.

**Contract**: New optional `type` on file entries: `skill` | `rule` | `prompt` | `mdc`. Backward compatible — old manifests without `type` still work.

#### 7. Granular + prompt tests

**File**: `test/install.test.js`

**Intent**: Verify selective install and prompt paths.

**Contract**: `--skill code-review --yes` without rules when `--rule` omitted and combined with artifact defaults policy: **when any granular flag is set, only explicitly listed categories install** (e.g. `--skill code-review` alone installs skill only). Test prompt install to `.cursor/prompts/pr-review.md`.

### Success Criteria:

#### Automated Verification:

- `npm test` covers `--skill`-only, `--prompt`, and mdc rule install
- `npm pack --dry-run` includes `content/prompts/` and new rules

#### Manual Verification:

- `install --skill code-review --rule AGENTS.md --agent cursor --yes` installs only selected artifacts
- Prompt appears in Cursor prompts UI (or file path documented)

**Implementation Note**: Pause before Phase 4.

---

## Phase 4: Opt-in Postinstall + Documentation

### Overview

Add env-gated `postinstall` for Node projects that depend on `@mraubo/ai-toolkit` and finalize consumer docs.

### Changes Required:

#### 1. Postinstall script

**File**: `scripts/postinstall.js`, `package.json`

**Intent**: Auto-install when consumer opts in.

**Contract**: `package.json` adds `"postinstall": "node scripts/postinstall.js"`. Script exits 0 immediately unless `process.env.AI_TOOLKIT_AUTO_INSTALL === "1"`. When set: resolve target from `INIT_CWD` || `process.cwd()`, spawn `node <packageRoot>/bin/cli.js install --yes --agent all --scope project` (inherit stdio). Catch errors, print warning, exit 0 (don't break consumer `npm install`).

#### 2. README

**File**: `README.md`

**Intent**: Document v0.2.0 surface.

**Contract**: Sections for `list`, `doctor`, `update`; granular flags table; Codex paths; `AI_TOOLKIT_AUTO_INSTALL=1` usage example for `package.json` projects; note Codex prompts unsupported.

#### 3. Setup script cross-link

**File**: `scripts/setup.sh`

**Intent**: Mention `doctor` as verification step after auth setup.

**Contract**: Final success message suggests `npx @mraubo/ai-toolkit doctor`.

#### 4. Postinstall test

**File**: `test/postinstall.test.js`

**Intent**: Verify gate behavior.

**Contract**: Without env var, postinstall exits 0 without creating files. With `AI_TOOLKIT_AUTO_INSTALL=1` in temp npm project with file dependency, install runs (or mock spawn).

### Success Criteria:

#### Automated Verification:

- `npm test` passes postinstall gate test
- `npm pack --dry-run` includes `scripts/postinstall.js`

#### Manual Verification:

- Consumer test project with `"@mraubo/ai-toolkit": "..."` + `AI_TOOLKIT_AUTO_INSTALL=1` gets artifacts on `npm install`
- Without env var, `npm install` does not write AI artifacts

**Implementation Note**: Final phase — tag `v0.2.0` after stakeholder sign-off.

---

## Testing Strategy

### Unit Tests:

- `artifacts.js`: filter logic, unknown name errors
- `auth-check.js`: missing token detection (mock fs)
- `agents.js`: Codex path resolution project vs global

### Integration Tests:

- Full install → `doctor` pass → `update` idempotent → selective uninstall still works
- Granular flags: skill-only install leaves rules untouched
- Codex + Cursor multi-agent single command

### Manual Testing Steps:

1. Install with `--agent codex,cursor --yes` in empty project
2. `doctor` after manual edit to installed skill → reports drift
3. `list --installed` shows checkmarks
4. `postinstall` gate in real `package.json` consumer project
5. Publish `v0.2.0`; `npx @mraubo/ai-toolkit@0.2.0 list` from external dir

## Performance Considerations

Negligible — same copy semantics as MVP. `doctor` hash pass is O(n) over manifest files (typically < 20).

## Migration Notes

Existing `.ai-toolkit/manifest.json` from v0.1.x remains valid. `update` adds optional `type` field on next install. No migration script required. Teams on v0.1.x can `npx @mraubo/ai-toolkit@0.2.0 update --yes` to refresh.

## References

- Archived MVP plan: `context/archive/2026-07-01-ai-toolkit-init/plan.md`
- Unified proposal: `context/propose/propose-unified.md`
- Codex skills: https://developers.openai.com/codex/skills
- Codex customization (AGENTS.md, `.agents/skills`): https://developers.openai.com/codex/concepts/customization

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Codex Agent + Extended Path Matrix

#### Automated

- [x] 1.1 `npm test` passes including new Codex install test — 1c627c3
- [x] 1.2 `node --check` on all `src/` and `bin/` files — 1c627c3

#### Manual

- [x] 1.3 Interactive install detects Codex when markers present — 1c627c3
- [x] 1.4 Codex skill visible in Codex CLI after install — 1c627c3

### Phase 2: `list`, `doctor`, `update` Commands

#### Automated

- [x] 2.1 `npm test` passes all new command tests — 068fc6e
- [x] 2.2 `node bin/cli.js list` exits 0 and lists `code-review` — 068fc6e

#### Manual

- [x] 2.3 `doctor` on misconfigured `~/.npmrc` prints actionable auth hint — 068fc6e
- [x] 2.4 `update` refreshes hashes after local content change — 068fc6e

### Phase 3: Granular Selection + Prompts + Cursor Rules

#### Automated

- [x] 3.1 `npm test` covers `--skill`-only, `--prompt`, and mdc rule install — d755dc3
- [x] 3.2 `npm pack --dry-run` includes `content/prompts/` and new rules — d755dc3

#### Manual

- [x] 3.3 Selective install installs only flagged artifacts — d755dc3
- [x] 3.4 Prompt file lands in `.cursor/prompts/` (or documented path) — d755dc3

### Phase 4: Opt-in Postinstall + Documentation

#### Automated

- [x] 4.1 `npm test` passes postinstall gate test — bf1f666
- [x] 4.2 `npm pack --dry-run` includes `scripts/postinstall.js` — bf1f666

#### Manual

- [x] 4.3 Consumer project with `AI_TOOLKIT_AUTO_INSTALL=1` auto-installs on `npm install` — bf1f666
- [x] 4.4 Without env var, `npm install` does not write AI artifacts — bf1f666
