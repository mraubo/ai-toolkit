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

upsert_npmrc_line() {
  local line="$1"
  local pattern="$2"
  touch "${NPMRC}"

  if grep -qF "${pattern}" "${NPMRC}"; then
    local tmp
    tmp="$(mktemp)"
    while IFS= read -r current || [ -n "${current}" ]; do
      if [[ "${current}" == *"${pattern}"* ]]; then
        printf '%s\n' "${line}"
      else
        printf '%s\n' "${current}"
      fi
    done < "${NPMRC}" > "${tmp}"
    mv "${tmp}" "${NPMRC}"
  else
    printf '%s\n' "${line}" >> "${NPMRC}"
  fi
}

configure_npmrc() {
  local token
  token="$(gh auth token)"

  upsert_npmrc_line "${SCOPE}:registry=${REGISTRY}" "${SCOPE}:registry="
  upsert_npmrc_line "//npm.pkg.github.com/:_authToken=${token}" "//npm.pkg.github.com/:_authToken="
  chmod 600 "${NPMRC}"
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
  echo "Done. Verify setup with:"
  echo "  npx -y @mraubo/ai-toolkit doctor"
  echo
  echo "Install in a project with:"
  echo "  npx -y @mraubo/ai-toolkit@0.2.1 install"
}

main "$@"
