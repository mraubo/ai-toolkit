# @mraubo/ai-toolkit

Private CLI installer for corporate AI artifacts (skills, rules) — distributed via [GitHub Packages](https://github.com/features/packages). Copy-installs into native **Cursor** and **Claude Code** directories.

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

## Install

From any project directory (PHP, Elixir, Node — no `package.json` required):

```bash
npx -y @mraubo/ai-toolkit@0.1.2 install
```

Interactive flow detects stack and installed agents, then prompts for scope and conflicts.

Non-interactive example:

```bash
npx -y @mraubo/ai-toolkit@0.1.2 install \
  --agent cursor \
  --scope project \
  --yes
```

### Flags

| Flag | Description |
|------|-------------|
| `--agent <claude,cursor\|all>` | Target agent(s) |
| `--scope <project\|global\|both>` | Install to project dir, home dir, or both |
| `--target <path>` | Target project directory (default: cwd) |
| `--yes`, `-y` | Skip prompts; **creates** missing/empty rules files; skips existing user-owned files with warning |
| `--force` | Overwrite existing files on conflict |
| `--dry-run` | Preview planned copies; write nothing |

### What gets installed

- `content/skills/code-review/` → `.cursor/skills/code-review/` (or `.claude/skills/…`)
- `content/rules/AGENTS.md` → project root (Cursor)
- `content/rules/CLAUDE.md` → project root (Claude Code)
- `.ai-toolkit/manifest.json` — tracks every installed file with SHA256 hash

**Recommended:** commit `.ai-toolkit/manifest.json`, `.cursor/skills/`, and rules files in target projects so the team shares the same toolkit version.

## Uninstall

Removes only manifest-tracked files:

```bash
npx -y @mraubo/ai-toolkit@0.1.2 uninstall --yes
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
git tag v0.1.2
git push origin v0.1.2
```

CI runs tests, `npm pack --dry-run`, then publishes to GitHub Packages.
