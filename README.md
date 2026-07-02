# @mraubo/ai-toolkit

Private CLI installer for corporate AI artifacts (skills, rules, prompts) — distributed via [GitHub Packages](https://github.com/features/packages). Copy-installs into native **Cursor**, **Claude Code**, and **Codex** directories.

## Prerequisites

- Node.js 20+
- GitHub CLI (`gh`) with access to `@mraubo` packages
- `read:packages` scope on your GitHub token

## One-time auth setup

### Option A — setup script (recommended for non-JS projects)

```bash
curl -fsSL https://raw.githubusercontent.com/mraubo/ai-toolkit/main/scripts/setup.sh | bash
```

Or from a cloned checkout:

```bash
bash scripts/setup.sh
```

The script checks Node ≥ 20, `gh` auth, refreshes `read:packages` if needed, and appends registry lines to `~/.npmrc` idempotently.

### Option B — manual

```bash
gh auth login
gh auth refresh -h github.com -s read:packages

TOKEN=$(gh auth token)
grep -q '@mraubo:registry=' ~/.npmrc 2>/dev/null || \
  printf '@mraubo:registry=https://npm.pkg.github.com\n' >> ~/.npmrc
grep -q '//npm.pkg.github.com/:_authToken=' ~/.npmrc 2>/dev/null || \
  printf '//npm.pkg.github.com/:_authToken=%s\n' "$TOKEN" >> ~/.npmrc
```

Verify auth with:

```bash
npx -y @mraubo/ai-toolkit@0.2.1 doctor
```

## Install

From any project directory (PHP, Elixir, Node — no `package.json` required):

```bash
npx -y @mraubo/ai-toolkit@0.2.1 install
```

Interactive flow detects stack and installed agents, then prompts for scope and conflicts.

Non-interactive example:

```bash
npx -y @mraubo/ai-toolkit@0.2.1 install \
  --agent cursor \
  --scope project \
  --yes
```

### Flags

| Flag | Description |
|------|-------------|
| `--agent <claude,cursor,codex\|all>` | Target agent(s) |
| `--scope <project\|global\|both>` | Install to project dir, home dir, or both |
| `--skill <name>` | Install selected skill(s), comma-separated |
| `--rule <name>` | Install selected rule(s): `AGENTS.md`, `CLAUDE.md`, or `.mdc` basename (e.g. `typescript`) |
| `--prompt <name>` | Install selected prompt(s), comma-separated |
| `--target <path>` | Target project directory (default: cwd) |
| `--yes`, `-y` | Skip prompts; **creates** missing/empty rules files; skips existing user-owned files with warning |
| `--force` | Overwrite existing files on conflict |
| `--dry-run` | Preview planned copies; write nothing |

When any granular flag (`--skill`, `--rule`, `--prompt`) is set, only the listed categories install. Example: `--skill code-review` alone installs the skill only — no rules or prompts.

### What gets installed

| Artifact | Source | Cursor | Claude Code | Codex |
|----------|--------|--------|-------------|-------|
| Skills | `content/skills/<name>/` | `.cursor/skills/<name>/` | `.claude/skills/<name>/` | `.agents/skills/<name>/` |
| Rules | `content/rules/AGENTS.md` | project root | — | project root |
| Rules | `content/rules/CLAUDE.md` | — | project root | — |
| Cursor rules | `content/rules/cursor/*.mdc` | `.cursor/rules/<basename>` | — | — |
| Prompts | `content/prompts/<name>.md` | `.cursor/prompts/<name>.md` | `.claude/commands/<name>.md` | *(unsupported)* |

`.ai-toolkit/manifest.json` tracks every installed file with SHA256 hash.

**Codex prompts:** Codex has no verified native prompts directory — prompt installation is skipped for Codex.

**Recommended:** commit `.ai-toolkit/manifest.json`, agent skill directories, and rules files in target projects so the team shares the same toolkit version.

## List, doctor, update

```bash
npx -y @mraubo/ai-toolkit@0.2.1 list              # bundled catalog
npx -y @mraubo/ai-toolkit@0.2.1 list --installed  # manifest status
npx -y @mraubo/ai-toolkit@0.2.1 doctor            # Node, auth, manifest, drift
npx -y @mraubo/ai-toolkit@0.2.1 update --yes      # re-sync from package version
```

`doctor` exits `0` when healthy, `1` when actionable issues are found (useful in CI).

## Opt-in auto-install (Node projects)

For Node projects that depend on `@mraubo/ai-toolkit`, you can auto-install artifacts on `npm install` by setting an environment variable:

```json
{
  "dependencies": {
    "@mraubo/ai-toolkit": "^0.2.1"
  },
  "scripts": {
    "preinstall": "export AI_TOOLKIT_AUTO_INSTALL=1"
  }
}
```

Or in CI / shell before install:

```bash
AI_TOOLKIT_AUTO_INSTALL=1 npm install
```

When `AI_TOOLKIT_AUTO_INSTALL=1`, the package `postinstall` hook runs `install --yes --agent all --scope project` in the consumer project (`INIT_CWD`). This installs artifacts for **all supported agents** (Claude, Cursor, and Codex) — not just the agent you use day-to-day. Expect `.claude/`, `.cursor/`, and `.agents/` directories (plus `AGENTS.md` / `CLAUDE.md` as applicable) to appear in the project root.

Without the env var, `npm install` does **not** write any AI artifacts — safe for teams that prefer explicit `npx` installs.

Errors during auto-install print a warning and exit `0` so they do not break `npm install`.

## Uninstall

Removes only manifest-tracked files:

```bash
npx -y @mraubo/ai-toolkit@0.2.1 uninstall --yes
```

**Global scope warning:** If you installed with `--scope global` or `both`, the manifest may include paths under your home directory (e.g. `~/.cursor/skills/code-review/`, `~/AGENTS.md`). Running `uninstall` from a project removes **all** manifest-tracked paths — including shared global artifacts that other projects may rely on. Review `.ai-toolkit/manifest.json` before uninstalling, or reinstall globally from a dedicated directory if you only want to clean one project.

## Conflict behavior

When a destination file already exists:

| Situation | Interactive | `--yes` | `--force` |
|-----------|-------------|---------|-----------|
| New file | copy | copy | copy |
| Unchanged since last install | update | update | update |
| User-owned (not in manifest) | prompt | skip + warning | overwrite |
| User modified (hash drift) | prompt | skip + warning | overwrite |

Interactive options for rules files (`AGENTS.md`, `CLAUDE.md`):

- `[s]` Skip
- `[b]` Backup and overwrite → `.ai-toolkit/backups/<timestamp>/`
- `[o]` Overwrite
- `[m]` Merge/prepend — toolkit rules in a `<!-- BEGIN @mraubo/ai-toolkit -->` block; your content preserved below

Skill directories support `[s/b/o]` only.

## Local development

**Do not run `npx` from inside this repository** — npm resolves the local package name and the bin shim is not linked. Use:

```bash
node bin/cli.js install --agent cursor --scope project --yes
npm test
```

## Publishing (maintainers)

```bash
npm test
git tag v0.2.1
git push origin v0.2.1
```

CI runs tests, `npm pack --dry-run`, then publishes to GitHub Packages.
