# ai-toolkit-init Implementation Plan

## Overview

Bootstrap `@mraubo/ai-toolkit` as a private npm CLI installer distributed through GitHub Package Registry. The package copy-installs corporate AI artifacts (skills, rules) from bundled `content/` into native agent directories for **Claude Code** and **Cursor**, using a declarative `tools.json` matrix and a hashed manifest at `.ai-toolkit/manifest.json`.

This is a greenfield build. The repo currently has design docs (`context/propose/propose-unified.md`), shaped requirements (`context/foundation/shape-notes.md`), and lesson templates (`.cursor/config-templates/m5l4-github-packages-*`) as reference patterns — but no `package.json`, installer code, or publish workflow yet.

## Current State Analysis

**What exists:**

- Canonical architecture spec: `context/propose/propose-unified.md` — modular layout, copy-mode, `tools.json`, manifest with hashes, phased rollout
- MVP scope locked in `context/foundation/shape-notes.md` — install/uninstall + one skill + rules; `update`/`doctor`/`list`/prompts deferred to v1.1
- Lesson templates at `.cursor/config-templates/` — simpler flat CommonJS package with `postinstall`, Claude-only paths, sentinel-merge rules. Useful for copy/hash/manifest patterns but **not** the target architecture
- CodeArtifact scaffolding skills (`pack-init`, `setup-cicd`, `tf-registry`) — out of scope; GH Packages is the distribution channel

**What's missing:**

- Entire npm package: `package.json`, `bin/cli.js`, `src/`, `content/`, `tools.json`, `scripts/setup.sh`, `test/`, `.github/workflows/publish.yml`

**Key constraints:**

- Copy-mode only (no symlinks) — npx cache is ephemeral; git symlinks break cross-platform
- Agent Skills Open Standard: skills are folders with `SKILL.md` frontmatter (`name`, `description`)
- Claude Code reads `.claude/skills/`; Cursor reads `.cursor/skills/` — different native paths per agent
- GH Packages requires scoped name matching GitHub owner: `@mraubo/ai-toolkit` for `https://github.com/mraubo`
- Consumer auth: `~/.npmrc` with `read:packages` scope; `npx` does not use `gh auth` alone

### Key Discoveries:

- Template installer (`.cursor/config-templates/m5l4-github-packages-install.js.template`) demonstrates `findProjectRoot()`, recursive `copyDir()`, and manifest tracking — adapt patterns into ESM `src/copy.js` and `src/manifest.js`
- Template uses sentinel-merge for rules; **decision: copy-only** — write separate `AGENTS.md` / `CLAUDE.md` per agent without merging into existing files
- Template manifest at `.claude/.ai-toolkit-manifest.json` without hashes; **decision: unified** `.ai-toolkit/manifest.json` with per-file SHA256
- Template publishes on push to main; **decision: tag-triggered** `v*.*.*` semver publish per propose-unified

## Desired End State

After this plan completes:

1. `@mraubo/ai-toolkit@0.1.0` (or `0.0.1` after Phase 0) is published to GitHub Packages via tag push
2. An org developer on a PHP project (no `package.json`) with one-time `~/.npmrc` auth runs:

   ```bash
   npx -y @mraubo/ai-toolkit install
   ```

3. Interactive flow detects stack (info-only) and agents; developer selects Claude and/or Cursor + project scope
4. Installer copies `code-review` skill + `AGENTS.md`/`CLAUDE.md` into native directories
5. `.ai-toolkit/manifest.json` records every installed file with SHA256 hash and agent tag
6. `npx -y @mraubo/ai-toolkit uninstall` removes only manifest-tracked files
7. Conflicts with user-modified files default to skip/backup; `--force` overwrites explicitly

**Verification:** PHP colleague sees `.cursor/skills/code-review/SKILL.md` + `AGENTS.md` without touching `composer.json`.

## What We're NOT Doing

- Codex agent support (deferred — paths unverified; add in v1.1)
- `update`, `list`, `doctor` subcommands (deferred to v1.1)
- `prompts/` and `.mdc` cursor rules (deferred to v1.1)
- Granular `--skill` / `--rule` / `--prompt` selectors (deferred to v1.1)
- Rules sentinel-merge into existing `CLAUDE.md` (copy-only per decision)
- AWS CodeArtifact path (`pack-init` / `tf-registry` skills)
- `postinstall` auto-install hook (explicit `npx … install` or `ai-toolkit install` only — avoids surprising installs on `npm install`)
- Tor „bez Node" (`curl | bash` tarball) — deferred to v2

## Implementation Approach

Build the **unified modular layout** from propose-unified, not the flat template layout. Use lesson templates as pattern reference for copy logic and CI validation, not as the file structure.

**Module boundaries:**

| Module | Responsibility |
|--------|----------------|
| `bin/cli.js` | Thin dispatcher: `install`, `uninstall` (MVP); parse argv |
| `src/agents.js` | Read `tools.json`; resolve target paths per agent + scope |
| `src/stack.js` | Detect stack from cwd markers (info-only display) |
| `src/copy.js` | Recursive copy, `expandTilde`, SHA256 hash, backup |
| `src/manifest.js` | Read/write/compare `.ai-toolkit/manifest.json` |
| `src/install.js` | Orchestrate install flow |
| `src/uninstall.js` | Remove manifest-tracked files |
| `tools.json` | Declarative matrix: claude + cursor only |
| `content/` | Bundled distributable artifacts |

Resolve bundled `content/` via `fileURLToPath(import.meta.url)` relative to package root. Write to `process.cwd()` (or `--target`).

## Critical Implementation Details

**Timing & lifecycle:** Phase 0 must prove GH Packages round-trip before building the full installer. Publishing a stub `bin/cli.js` that echoes version validates auth, scope, and `npx` consumption — the highest-risk unknown in a greenfield GH Packages setup.

**npx without TTY:** All non-interactive paths must accept `--yes` to skip prompts. In CI or scripts, always pass `-y` to npx and `--yes` to install.

## Phase 1: GH Packages Round-Trip (Phase 0)

### Overview

Prove the full publish → consume cycle with a minimal package before investing in installer logic.

### Changes Required:

#### 1. Package skeleton

**File**: `package.json`

**Intent**: Register `@mraubo/ai-toolkit` as a scoped ESM package publishable to GitHub Packages.

**Contract**: `name: "@mraubo/ai-toolkit"`, `type: "module"`, `engines.node: ">=20"`, `publishConfig.registry: "https://npm.pkg.github.com"`, `repository.url: "https://github.com/mraubo/ai-toolkit.git"`, `bin.ai-toolkit: "./bin/cli.js"`, `files: ["bin", "src", "content", "tools.json", "scripts"]`.

#### 2. Stub CLI

**File**: `bin/cli.js`

**Intent**: Minimal entry point that prints version and usage so `npx @mraubo/ai-toolkit` resolves and executes.

**Contract**: Shebang `#!/usr/bin/env node`; handle no-args and unknown commands with usage text including package version from `package.json`.

#### 3. Publish workflow

**File**: `.github/workflows/publish.yml`

**Intent**: Validate and publish to GH Packages on semver tag push.

**Contract**: Trigger `on.push.tags: ["v*.*.*"]`; jobs `validate` (checkout, setup-node with registry-url + scope `@mraubo`, `npm ci`, `npm pack --dry-run`) and `publish` (needs validate, `npm publish`, `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, `permissions.packages: write`).

#### 4. Consumer auth docs (stub)

**File**: `README.md`

**Intent**: Document one-time `~/.npmrc` setup for `@mraubo` scope using `gh auth token` with `read:packages`.

**Contract**: Include exact `~/.npmrc` lines and `gh auth refresh -h github.com -s read:packages` instruction.

### Success Criteria:

#### Automated Verification:

- `npm pack --dry-run` succeeds and lists `bin/cli.js`
- Local: `node bin/cli.js` prints usage without error

#### Manual Verification:

- Tag `v0.0.1` pushed; GH Actions publish job succeeds
- From a separate directory (ideally a PHP project without `package.json`), with `~/.npmrc` configured, `npx -y @mraubo/ai-toolkit@0.0.1` runs the stub CLI
- Package visible at `https://github.com/mraubo?tab=packages`

**Implementation Note**: Pause for manual confirmation that round-trip works before Phase 2.

---

## Phase 2: Core Installer

### Overview

Implement the copy installer with declarative agent matrix, bundled content, and basic install/uninstall.

### Changes Required:

#### 1. Agent matrix

**File**: `tools.json`

**Intent**: Single source of truth for Claude Code and Cursor target paths (project + global scope).

**Contract**: Two top-level keys `claude` and `cursor`, each with `name`, `detect` (marker files/dirs), `targets.project` and `targets.global` containing `skills_dir`, `rules_file` paths. Claude: `.claude/skills`, `CLAUDE.md`. Cursor: `.cursor/skills`, `AGENTS.md`. Global paths use `~/` prefix.

#### 2. Agent path resolver

**File**: `src/agents.js`

**Intent**: Thin reader of `tools.json` — load matrix, detect installed agents from cwd markers, resolve destination paths for a given agent + scope.

**Contract**: Export `loadTools()`, `detectAgents(cwd)`, `resolveTarget(agent, scope, artifactType)` returning absolute paths. No hardcoded agent paths in other modules.

#### 3. Stack detector

**File**: `src/stack.js`

**Intent**: Info-only stack detection for interactive prompt display.

**Contract**: Export `detectStack(cwd)` returning a label (`php`, `node`, `elixir`, `unknown`, etc.) based on marker files (`composer.json`, `package.json`, `mix.exs`, etc.). Does not filter what gets installed.

#### 4. Copy utilities

**File**: `src/copy.js`

**Intent**: Recursive directory copy with SHA256 hashing and tilde expansion.

**Contract**: Export `expandTilde(path)`, `hashFile(path)` → `sha256:…`, `copyArtifact(src, dest)` using `fs.cpSync({ recursive: true })` (Node 20+), `backupFile(dest, backupDir)` before overwrite.

#### 5. Manifest manager

**File**: `src/manifest.js`

**Intent**: Read, write, and compare `.ai-toolkit/manifest.json` in the target project.

**Contract**: Schema fields: `version` (package version), `installedAt` (ISO), `agents` (array), `files` (array of `{ src, dest, hash, agent }`). Export `readManifest(cwd)`, `writeManifest(cwd, data)`, `findEntry(manifest, dest)`.

#### 6. Install orchestrator

**File**: `src/install.js`

**Intent**: Main install flow — resolve content dir, select agents, copy skills + rules, write manifest.

**Contract**: Steps: (1) resolve bundled `content/` path, (2) determine agents from flags or interactive prompt, (3) determine scope (`project`|`global`|`both`), (4) for each skill folder in `content/skills/` × each agent: copy to `skills_dir/<name>/`, (5) for each rules file in `content/rules/`: copy `CLAUDE.md` to claude `rules_file`, `AGENTS.md` to cursor `rules_file`, (6) write manifest, (7) print summary. Initial version: copy without conflict logic (added in Phase 3).

#### 7. Uninstall orchestrator

**File**: `src/uninstall.js`

**Intent**: Remove all files tracked in manifest; delete manifest itself.

**Contract**: Read `.ai-toolkit/manifest.json`; for each `files[].dest`, remove file or directory; remove `.ai-toolkit/` if empty. Never touch files not in manifest.

#### 8. CLI dispatcher

**File**: `bin/cli.js`

**Intent**: Wire `install` and `uninstall` subcommands to orchestrators.

**Contract**: Parse `process.argv`; dispatch `install` → `src/install.js`, `uninstall` → `src/uninstall.js`; print usage for unknown commands.

#### 9. Starter content

**File**: `content/skills/code-review/SKILL.md`

**Intent**: One proof skill following Agent Skills Open Standard.

**Contract**: Frontmatter `name: code-review` (matches folder name), `description:` per `m5l4-shared-spec-skill.md` conventions. Body: review categories (Naming, Error handling, TypeScript, Function design, Security, Testing) with severity-ordered output format.

**File**: `content/rules/AGENTS.md`

**Intent**: Base rules file for Cursor and Codex-compatible agents.

**Contract**: Team engineering conventions suitable for copy into project root.

**File**: `content/rules/CLAUDE.md`

**Intent**: Claude Code-specific rules variant.

**Contract**: Same conventions as AGENTS.md, adapted for Claude Code context if needed.

### Success Criteria:

#### Automated Verification:

- `node bin/cli.js install --target ./test-fixtures/empty-project --agent cursor --scope project --yes` creates expected files
- `node bin/cli.js uninstall --target ./test-fixtures/empty-project --yes` removes all installed files and manifest
- `npm pack --dry-run` includes `content/skills/code-review/SKILL.md`, `tools.json`, all `src/` modules

#### Manual Verification:

- Interactive install in a real project with both `.cursor/` and `.claude/` markers prompts agent selection
- `code-review` skill visible in Cursor agent skills picker after install
- Stack label displayed in interactive output (e.g., `🔍 Stack: php`)

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Conflict Handling & CLI Flags

### Overview

Add production-grade conflict resolution, non-interactive flags, and global scope support.

### Changes Required:

#### 1. Conflict resolution in install

**File**: `src/install.js`

**Intent**: Apply conflict rules before every copy operation.

**Contract**: Decision table per propose-unified §5:

| Destination state | Default (interactive) | `--force` | `--yes` (CI) |
|---|---|---|---|
| Does not exist | copy | copy | copy |
| Exists, hash matches manifest | overwrite (update) | overwrite | overwrite |
| Exists, not in manifest (user file) | prompt: skip/backup/overwrite | overwrite | skip + warning |
| Exists, hash ≠ manifest (user modified) | prompt: skip/backup/overwrite | overwrite | skip + warning |

Backup destination to `.ai-toolkit/backups/<timestamp>/` before overwrite when backup is chosen or forced.

#### 2. CLI argument parser

**File**: `bin/cli.js` (or `src/args.js` if parser grows)

**Intent**: Parse flags for non-interactive and CI usage.

**Contract**: Flags: `--agent <claude,cursor|all>`, `--scope <project|global|both>`, `--yes`, `--force`, `--dry-run`, `--target <path>`. `--dry-run` prints planned copies without writing. `--yes` suppresses all prompts.

#### 3. Global scope support

**File**: `src/copy.js`, `src/agents.js`

**Intent**: Install to homedir paths when `--scope global` or `both`.

**Contract**: `expandTilde()` resolves `~/…` to `os.homedir()` cross-platform. Global manifest still written to target project's `.ai-toolkit/manifest.json` (project scope) or a documented location for global-only installs.

#### 4. Dry-run mode

**File**: `src/install.js`

**Intent**: Preview install actions without side effects.

**Contract**: When `--dry-run`, log each planned `src → dest` copy and conflict resolution action; do not write files or manifest.

### Success Criteria:

#### Automated Verification:

- Install with `--dry-run` produces output listing copies; no files created
- Install with `--yes` on a directory with a pre-existing user-owned `AGENTS.md` skips with warning (no overwrite)
- Install with `--force` overwrites pre-existing file and records new hash in manifest
- Backup directory created at `.ai-toolkit/backups/<timestamp>/` when conflict triggers backup

#### Manual Verification:

- Interactive prompt offers skip/backup/overwrite on conflict
- `--scope global` installs skill to `~/.cursor/skills/code-review/` (verify on macOS)
- Re-running install with unchanged content is idempotent (no duplicate manifest entries)

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Onboarding, Tests & Documentation

### Overview

Ship developer onboarding (`setup.sh`), automated tests, and consumer documentation.

### Changes Required:

#### 1. Auth setup script

**File**: `scripts/setup.sh`

**Intent**: One-time machine setup for non-JS developers (PHP, Elixir, etc.).

**Contract**: Check `node --version` (≥20), `gh` installed, `gh auth status` with `read:packages` scope; if missing, instruct `gh auth refresh -h github.com -s read:packages`; append `@mraubo:registry` and auth token lines to `~/.npmrc` idempotently.

#### 2. Install tests

**File**: `test/install.test.js`

**Intent**: Automated regression tests for install/uninstall round-trip.

**Contract**: Use `node:test` + `node:assert`. Create temp dir; run install with `--yes --agent cursor --scope project`; assert files exist + manifest schema valid + hashes match; run uninstall; assert clean removal. Add conflict scenario test with `--force`.

#### 3. Package test script

**File**: `package.json`

**Intent**: Wire `npm test` to run install tests.

**Contract**: `"scripts": { "test": "node --test test/" }`.

#### 4. Consumer README

**File**: `README.md`

**Intent**: Complete onboarding and usage docs for org developers.

**Contract**: Sections: prerequisites (Node 20+, gh), one-time auth (`setup.sh` or manual), install (`npx -y @mraubo/ai-toolkit install`), flags reference, uninstall, conflict behavior, committing manifest in target projects (recommended), pinning version (`@0.1.0`).

#### 5. Publish workflow test gate

**File**: `.github/workflows/publish.yml`

**Intent**: Run tests before publish.

**Contract**: Add `npm test` step to `validate` job before `npm pack --dry-run`.

#### 6. Gitignore for local test artifacts

**File**: `.gitignore`

**Intent**: Exclude test fixture output and local npm pack tarballs.

**Contract**: Add `test-fixtures/*/`, `*.tgz`, `.ai-toolkit/` if created at repo root during dev.

### Success Criteria:

#### Automated Verification:

- `npm test` passes all install/uninstall tests
- `npm pack --dry-run` succeeds
- Lint: no syntax errors in all `src/` and `bin/` files (`node --check` on each)

#### Manual Verification:

- Fresh machine (or clean `~/.npmrc` test): `scripts/setup.sh` completes and enables `npx -y @mraubo/ai-toolkit install`
- Full milestone: PHP colleague runs install, sees `.cursor/skills/code-review/` + `AGENTS.md`, no `composer.json` changes
- Tag `v0.1.0` publish succeeds; install from published package matches local install behavior
- `uninstall` after published install leaves no toolkit artifacts

**Implementation Note**: This is the final phase — confirm milestone with stakeholder before archiving the change.

---

## Testing Strategy

### Unit Tests:

- `src/copy.js`: `expandTilde`, `hashFile` consistency
- `src/manifest.js`: read/write round-trip, `findEntry`
- `src/agents.js`: path resolution for claude/cursor, project vs global
- `src/stack.js`: marker detection for php/node/unknown

### Integration Tests:

- Full install → manifest validation → uninstall clean-up in temp directory
- Conflict: pre-seeded user file + `--yes` skips; `--force` overwrites
- `--dry-run` produces no filesystem changes

### Manual Testing Steps:

1. Phase 0: `npx` stub from non-JS project with `~/.npmrc` auth
2. Install to project with only `.cursor/` — cursor paths populated
3. Install to project with only `.claude/` — claude paths populated
4. Install with both markers — interactive multi-agent selection works
5. Modify an installed file, re-install — conflict prompt appears
6. `uninstall` — only toolkit files removed; user's unrelated files untouched
7. Global scope install to `~/.cursor/skills/`

## Performance Considerations

Not a concern for MVP. Copying markdown skill folders is negligible. `fs.cpSync` on a handful of files completes in milliseconds.

## Migration Notes

Not applicable — greenfield. Consumer projects have no prior `@mraubo/ai-toolkit` manifest. If lesson-template sentinel-merge was used in any project, this installer does not migrate those — fresh install only.

## References

- Unified proposal: `context/propose/propose-unified.md`
- Shape notes: `context/foundation/shape-notes.md`
- Lesson templates: `.cursor/config-templates/m5l4-github-packages-*.template`
- Skill content spec: `.cursor/prompts/m5l4-shared-spec-skill.md`
- Agent Skills Open Standard: https://agentskills.io

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: GH Packages Round-Trip (Phase 0)

#### Automated

- [x] 1.1 `npm pack --dry-run` succeeds and lists `bin/cli.js` — d8f0685
- [x] 1.2 `node bin/cli.js` prints usage without error — d8f0685

#### Manual

- [x] 1.3 Tag `v0.0.1` pushed; GH Actions publish succeeds — d8f0685
- [x] 1.4 `npx -y @mraubo/ai-toolkit@0.0.1` runs stub CLI from non-JS project — d8f0685

### Phase 2: Core Installer

#### Automated

- [ ] 2.1 Install to test fixture creates expected cursor files
- [ ] 2.2 Uninstall removes all installed files and manifest
- [ ] 2.3 `npm pack --dry-run` includes content, tools.json, src modules

#### Manual

- [ ] 2.4 Interactive install prompts agent selection in real project
- [ ] 2.5 `code-review` skill visible in Cursor after install

### Phase 3: Conflict Handling & CLI Flags

#### Automated

- [ ] 3.1 `--dry-run` lists copies without creating files
- [ ] 3.2 `--yes` skips overwrite of user-owned file with warning
- [ ] 3.3 `--force` overwrites and updates manifest hash
- [ ] 3.4 Backup created at `.ai-toolkit/backups/<timestamp>/` on conflict

#### Manual

- [ ] 3.5 Interactive conflict prompt offers skip/backup/overwrite
- [ ] 3.6 `--scope global` installs to `~/.cursor/skills/`
- [ ] 3.7 Re-install with unchanged content is idempotent

### Phase 4: Onboarding, Tests & Documentation

#### Automated

- [ ] 4.1 `npm test` passes all install/uninstall tests
- [ ] 4.2 `npm pack --dry-run` succeeds in CI validate job
- [ ] 4.3 `node --check` passes on all src/ and bin/ files

#### Manual

- [ ] 4.4 `scripts/setup.sh` enables npx install on fresh machine
- [ ] 4.5 PHP colleague milestone: `.cursor/skills/code-review/` + `AGENTS.md` without composer.json
- [ ] 4.6 Tag `v0.1.0` publish; install from published package works
- [ ] 4.7 Uninstall after published install leaves no toolkit artifacts
