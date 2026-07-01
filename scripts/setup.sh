#!/usr/bin/env bash
set -euo pipefail

SCOPE="@mraubo"
REGISTRY="https://npm.pkg.github.com"
NPMRC="${HOME}/.npmrc"

err() {
  echo "ai-toolkit setup: $*" >&2
}

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    err "Node.js is required (>= 20). Install from https://nodejs.org/"
    exit 1
  fi

  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  if [ "${major}" -lt 20 ]; then
    err "Node.js 20+ required (found $(node -v))"
    exit 1
  fi
  echo "✓ Node $(node -v)"
}

require_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    err "GitHub CLI (gh) is required. Install from https://cli.github.com/"
    exit 1
  fi
  echo "✓ gh $(gh --version | head -1)"
}

ensure_gh_auth() {
  if ! gh auth status >/dev/null 2>&1; then
    err "Not logged in to GitHub. Run: gh auth login"
    exit 1
  fi

  if ! gh auth status 2>&1 | grep -q "read:packages"; then
    echo "→ Refreshing gh token with read:packages scope…"
    gh auth refresh -h github.com -s read:packages
  fi
  echo "✓ gh auth (read:packages)"
}

append_npmrc_line() {
  local line="$1"
  local pattern="$2"
  if [ -f "${NPMRC}" ] && grep -qF "${pattern}" "${NPMRC}"; then
    return 0
  fi
  printf '%s\n' "${line}" >> "${NPMRC}"
}

configure_npmrc() {
  local token
  token="$(gh auth token)"

  append_npmrc_line "${SCOPE}:registry=${REGISTRY}" "${SCOPE}:registry="
  append_npmrc_line "//npm.pkg.github.com/:_authToken=${token}" "//npm.pkg.github.com/:_authToken="
  echo "✓ ~/.npmrc configured for ${SCOPE}"
}

main() {
  echo "ai-toolkit — one-time machine setup"
  echo
  require_node
  require_gh
  ensure_gh_auth
  configure_npmrc
  echo
  echo "Done. Install in a project with:"
  echo "  npx -y @mraubo/ai-toolkit@0.1.1 install"
}

main "$@"
