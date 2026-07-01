# ai-toolkit-init — Plan Brief

> Full plan: `context/changes/ai-toolkit-init/plan.md`
> Upstream: `context/propose/propose-unified.md`, `context/foundation/shape-notes.md`

## What & Why

Corporate AI artifacts (skills, rules) must reach every developer's project, but each agent (Cursor, Claude Code) reads from different native directories. We're building `@mraubo/ai-toolkit` — a private npm CLI installer distributed via GitHub Package Registry that copy-installs artifacts from a neutral `content/` bundle into the right agent folders. Copy-mode is mandatory: agents won't converge on one path, npx cache is ephemeral, and symlinks break cross-platform.

## Starting Point

Greenfield repo with design docs and lesson templates (`.cursor/config-templates/m5l4-github-packages-*`) but zero package code. Templates demonstrate a simpler flat CommonJS layout (postinstall, Claude-only, sentinel-merge rules) — we evolve past them toward the unified modular architecture in propose-unified.

## Desired End State

A PHP developer with one-time `~/.npmrc` auth runs `npx -y @mraubo/ai-toolkit install`, selects Cursor and/or Claude, and gets `code-review` skill + rules in native directories with a hashed `.ai-toolkit/manifest.json`. `uninstall` cleanly reverses. Package published on `v*.*.*` tags to GH Packages.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|------------------|--------|
| Package layout | Modular (`bin/` + `src/` + `content/` + `tools.json`) | Scales to multi-agent without hardcoded paths; matches propose-unified | Plan |
| Distribution | GitHub Packages (`@mraubo`) | Org-only access gate; shape-notes settled GH Packages over CodeArtifact | Shape / Plan |
| Agents in MVP | Claude + Cursor | Covers milestone (.cursor/skills + AGENTS.md); Codex paths unverified | Plan |
| Rules strategy | Copy-only (no sentinel merge) | Simpler mental model; avoids corrupting user's CLAUDE.md | Plan |
| Manifest | `.ai-toolkit/manifest.json` with SHA256 | Enables safe uninstall/update; conflict detection by hash | Plan / Unified |
| Publish trigger | Tag `v*.*.*` semver | Explicit versioning for team pinning; matches propose-unified | Plan |
| MVP scope | install + uninstall only | Shape-notes scoped down; update/doctor/prompts → v1.1 | Shape |
| postinstall hook | No auto-install | Explicit `npx install` avoids surprising side effects on npm install | Plan |

## Scope

**In scope:**
- `@mraubo/ai-toolkit` npm package (ESM, Node ≥20)
- GH Packages publish workflow (tag-triggered)
- `install` + `uninstall` CLI subcommands
- `tools.json` matrix for Claude + Cursor (project + global scope)
- One skill (`code-review`) + `AGENTS.md` / `CLAUDE.md` rules
- Hashed manifest, conflict handling (skip/backup/force), CLI flags
- `scripts/setup.sh` auth onboarding + `node:test` tests

**Out of scope:**
- Codex agent, `update`/`doctor`/`list`, prompts, `.mdc` rules
- Granular `--skill`/`--rule` selectors
- AWS CodeArtifact, `postinstall` auto-install, curl|bash no-Node path

## Architecture / Approach

```
npx @mraubo/ai-toolkit install
        │
        ▼
   bin/cli.js ──► src/install.js
        │              │
        │              ├── src/agents.js ◄── tools.json (claude, cursor paths)
        │              ├── src/stack.js (info-only detection)
        │              ├── src/copy.js (hash, backup, expandTilde)
        │              └── src/manifest.js ◄── .ai-toolkit/manifest.json
        │
        ▼
   content/skills/ + content/rules/  ──copy──►  .cursor/skills/, .claude/skills/, AGENTS.md, CLAUDE.md
```

Installer reads bundled `content/` from the published package tarball; writes to consumer's `process.cwd()`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|------------------|----------|
| 1. GH Packages round-trip | Stub package published + consumable via npx | Auth/scope misconfiguration blocks everything |
| 2. Core installer | install/uninstall with tools.json + content | Agent path mapping errors → files in wrong dirs |
| 3. Conflict & flags | Hash manifest, backup, --yes/--force/--dry-run | Overwriting user files without proper guards |
| 4. Onboarding & tests | setup.sh, node:test, README, v0.1.0 publish | Test coverage gaps on global scope / Windows |

**Prerequisites:** GitHub account `mraubo`, ability to publish to GH Packages, Node 20+ locally
**Estimated effort:** ~1 week MVP (per shape-notes), 4 phases across 3-4 implementation sessions

## Open Risks & Assumptions

- Assumes `https://github.com/mraubo/ai-toolkit` repo exists (or will be created) with GH Packages enabled
- Claude Code global paths (`~/.claude/skills/`) confirmed; Codex paths deferred intentionally
- Windows `expandTilde` for global scope needs manual verification in Phase 3
- Team will commit `.ai-toolkit/manifest.json` in consumer projects (recommended, not enforced)

## Success Criteria (Summary)

- `npx -y @mraubo/ai-toolkit install` works from a non-JS project after one-time auth
- PHP colleague sees `.cursor/skills/code-review/` + `AGENTS.md` without touching `composer.json`
- `uninstall` removes only toolkit-managed files; user modifications protected by default
