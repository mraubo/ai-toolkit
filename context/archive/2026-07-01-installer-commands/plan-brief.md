# installer-commands — Plan Brief

> Full plan: `context/changes/installer-commands/plan.md`

## What & Why

Rozszerzamy `@mraubo/ai-toolkit` o funkcje odłożone po MVP: agent **Codex**, komendy **`list` / `doctor` / `update`**, selekcję **`--skill` / `--rule` / `--prompt`**, kategorię **`content/prompts/`** oraz **opcjonalny `postinstall`**. Cel: operacyjny instalator z drift detection i granularną kontrolą, bez łamania istniejących manifestów v0.1.x.

## Starting Point

MVP (v0.1.2) dostarcza `install`/`uninstall` dla Claude + Cursor, copy-mode, manifest z SHA256, konflikty, `--dry-run`. Brakuje Codex, subkomend operacyjnych, filtrowania artefaktów i promptów.

## Desired End State

Developer uruchamia `npx @mraubo/ai-toolkit@0.2.0` z pełnym CLI: instalacja do Codex (`.agents/skills/`), `doctor` wykrywa drift auth/manifest, `list` pokazuje katalog paczki, `update` synchronizuje wersję, `--skill`/`--rule`/`--prompt` ograniczają zakres. Projekty Node mogą włączyć auto-instalację przez `AI_TOOLKIT_AUTO_INSTALL=1`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|------------------|--------|
| Codex skills path | `.agents/skills/` (project + `~/.agents/skills/` global) | Oficjalna konwencja OpenAI Codex 2026 | Plan |
| Codex prompts | Out of scope | Brak zweryfikowanej natywnej ścieżki dla promptów | Plan |
| postinstall | Opt-in via `AI_TOOLKIT_AUTO_INSTALL=1` | MVP świadomie unikał niespodziewanych instalacji | Plan |
| Granular flags default | Flaga ustawiona → tylko ta kategoria; brak flag → wszystko | Przewidywalne zachowanie `--skill` bez reguł | Plan |
| update | Re-use install pipeline + manifest inference | Jedna ścieżka copy/konfliktów, mniej driftu kodu | Plan |
| Release version | v0.2.0 minor | Nowe komendy i agent, kompatybilny manifest | Plan |

## Scope

**In scope:**
- Codex w `tools.json` + testy instalacji
- `list`, `doctor`, `update`, `auth-check.js`
- `--skill`, `--rule`, `--prompt` + `artifacts.js`
- `content/prompts/`, opcjonalnie `content/rules/cursor/*.mdc`
- `scripts/postinstall.js` (env-gated)
- README + testy

**Out of scope:**
- Prompty Codex
- `curl | bash` installer
- Domyślny postinstall bez env
- Dedup skilli Cursor/Codex w `.agents/`

## Architecture / Approach

Nowe moduły (`list`, `doctor`, `update`, `auth-check`, `artifacts`) + rozszerzenie `agents.js` i refaktor `install.js` do wspólnego resolvera artefaktów. `tools.json` pozostaje single source of truth dla ścieżek. Manifest rozszerzony opcjonalnie o `type`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|------------------|----------|
| 1. Codex + paths | Agent Codex, `.agents/skills/`, test | Ścieżki global vs project |
| 2. CLI commands | `list`, `doctor`, `update` | Auth check false positives |
| 3. Granular + prompts | `--skill`/`--rule`/`--prompt`, content | Semantyka „tylko wybrane” |
| 4. postinstall + docs | Env-gated hook, README | `INIT_CWD` edge cases |

**Prerequisites:** MVP v0.1.x merged and published; Node 20+; dostęp do docs Codex przy manual QA fazy 1.

**Estimated effort:** ~3–4 sesje implementacji (4 fazy).

## Open Risks & Assumptions

- Codex może zmienić ścieżki discover — macierz w `tools.json` łatwa do patcha
- `doctor` auth check bez sieci może być heurystyczny (tylko `~/.npmrc`)
- Prompty Cursor/Claude mogą wymagać restartu IDE po instalacji (manual QA)

## Success Criteria (Summary)

- `install --agent codex` tworzy `.agents/skills/code-review/` + `AGENTS.md`
- `doctor` raportuje drift i wersję manifestu
- `install --skill code-review` bez innych flag nie dotyka rules
- `AI_TOOLKIT_AUTO_INSTALL=1` włącza postinstall; bez env — cisza
