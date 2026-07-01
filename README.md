# @mraubo/ai-toolkit

Private CLI installer for corporate AI artifacts (skills, rules) — distributed via [GitHub Packages](https://github.com/features/packages).

> **v0.0.1** is a publish round-trip stub. `install` and `uninstall` land in v0.1.0.

## Prerequisites

- Node.js 20+
- GitHub CLI (`gh`) or a PAT with `read:packages`
- Membership in the GitHub account/org that owns `@mraubo/ai-toolkit`

## One-time auth setup

`npx` uses npm — `gh auth login` alone is not enough. Configure `~/.npmrc` once per machine:

```bash
gh auth login
gh auth refresh -h github.com -s read:packages
```

Then append registry lines (idempotent — skip lines you already have):

```bash
TOKEN=$(gh auth token)
grep -q '@mraubo:registry=' ~/.npmrc 2>/dev/null || \
  printf '@mraubo:registry=https://npm.pkg.github.com\n' >> ~/.npmrc
grep -q '//npm.pkg.github.com/:_authToken=' ~/.npmrc 2>/dev/null || \
  printf '//npm.pkg.github.com/:_authToken=%s\n' "$TOKEN" >> ~/.npmrc
```

Manual alternative — add to `~/.npmrc`:

```ini
@mraubo:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

## Usage (stub)

```bash
npx -y @mraubo/ai-toolkit@0.0.1
```

## Publishing (maintainers)

Push a semver tag to trigger CI publish:

```bash
git tag v0.0.1
git push origin v0.0.1
```

The workflow validates with `npm pack --dry-run`, then publishes to GitHub Packages.
