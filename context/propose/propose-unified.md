# ai-toolkit — ujednolicona propozycja implementacji

Synteza czterech propozycji (c, g, l, o). Traktujemy narzędzie nie jak „bibliotekę JS”, ale jak **prywatny CLI installer pakowany w npm i dystrybuowany przez GitHub Package Registry**, który po uruchomieniu fizycznie kopiuje artefakty AI (skills, rules, prompts) do natywnych katalogów agentów w bieżącym projekcie.

---

## 0. Najważniejsze znalezisko (z propose-l) — zmienia architekturę

Istnieje **Agent Skills Open Standard** wspierany przez 30+ narzędzi: `SKILL.md` z frontmatterem (`name`, `description`) + opcjonalne `scripts/`, `references/`, `assets/`. To oznacza:

- **Autorujesz skill raz** w neutralnej strukturze, instalator tylko decyduje, do których katalogów go skopiować per agent.
- Nie utrzymujesz trzech równoległych wersji tego samego pliku.
- Źródła: [Agent Skills Open Standard](https://codex.danielvaughan.com/2026/05/05/agent-skills-open-standard-portable-skills-codex-cli-cross-agent/), [Codex skills](https://developers.openai.com/codex/skills), [Cursor skills](https://cursor.com/help/customization/skills), [Claude Code skills](https://code.claude.com/docs/en/skills).

**Wąskie gardło do zapamiętania:** Claude Code (stan lipiec 2026) czyta natywnie tylko `~/.claude/skills/` i `.claude/skills/` (otwarte issue [#53950](https://github.com/anthropics/claude-code/issues/53950), [#56193](https://github.com/anthropics/claude-code/issues/56193)). Cursor jest najbardziej elastyczny (czyta też `.agents/skills/` i `.claude/skills/`). **Dlatego copy-mode do natywnego katalogu per agent jest właściwym podejściem** — symlinki w git/CI są kruche cross-platform.

---

## 1. Copy-mode — dlaczego obowiązkowy

Dwa niezależne powody:

1. **npx cache jest ulotny** — po wyjściu z komendy paczka znika z cache'a, symlink wskazywałby w void.
2. **Symlinki w git są kruche cross-platform** — Windows bez developer mode, CI bez `core.symlinks`, renderują się jako plik tekstowy.

Bonus: copy naturalnie obsługuje to, że każdy agent ma **inny natywny katalog**, więc i tak trzeba materializować pliki w kilku miejscach.

---

## 2. Proponowana struktura paczki

Rozdzielamy **kod instalatora** od **dystrybuowanych artefaktów** (wspólne w c, g, l, o):

```
ai-toolkit/
├── package.json
├── bin/
│   └── cli.js                   # dispatcher: install | uninstall | update | list | doctor
├── src/
│   ├── install.js
│   ├── uninstall.js
│   ├── update.js
│   ├── manifest.js              # read/write/compare .ai-toolkit/manifest.json
│   ├── agents.js                # cienki reader tools.json (macierz w JSON, nie w kodzie)
│   ├── stack.js                 # detekcja stacka po markerach (composer.json, mix.exs, ...)
│   ├── copy.js                  # copy + hash + backup + expandTilde (~)
│   └── auth-check.js            # weryfikacja .npmrc/gh token (dla doctor)
├── content/                     # TO jest dystrybuowane (wtracone w tarball)
│   ├── skills/
│   │   └── code-review/SKILL.md
│   ├── rules/
│   │   ├── AGENTS.md            # bazowe reguły (Codex + Cursor)
│   │   ├── CLAUDE.md            # wariant dla Claude Code
│   │   └── cursor/
│   │       └── typescript.mdc   # reguły Cursor-specific (frontmatter)
│   └── prompts/
│       └── pr-review.md
├── tools.json                   # deklaratywne mapowanie narzędzie → ścieżki (project + global)
├── scripts/
│   └── setup.sh                 # one-time auth dla non-JS stacków
├── test/
│   └── install.test.js
└── .github/workflows/
    └── publish.yml
```

`package.json`:

```json
{
  "name": "@twoja-org/ai-toolkit",
  "version": "0.1.0",
  "type": "module",
  "description": "Corporate AI dev artifacts for Cursor, Claude Code, Codex",
  "bin": { "ai-toolkit": "./bin/cli.js" },
  "files": ["bin", "src", "content", "tools.json", "scripts"],
  "publishConfig": { "registry": "https://npm.pkg.github.com" },
  "engines": { "node": ">=20" },
  "repository": {
    "type": "git",
    "url": "https://github.com/twoja-org/ai-toolkit.git"
  }
}
```

Kluczowe pola:
- `files` — whitelist tego, co wejdzie do tarballa (nie `.github/`, nie testy).
- `publishConfig.registry` — wymusza GH Packages, nie npmjs.org.
- `bin` — umożliwia `npx @twoja-org/ai-toolkit install`.
- Scope `@twoja-org` **musi** pasować do nazwy org na GitHubie.

Instalator czyta ze swojego bundlowanego `content/` (przez `fileURLToPath(import.meta.url)`), a pisze do `process.cwd()` projektu użytkownika.

---

## 3. Macierz docelowa per agent (serce instalatora)

Macierz żyje w **deklaratywnym `tools.json`** (single source of truth), a nie hardcodowana w JS. Dodanie nowego narzędzia (Windsurf, Gemini CLI) = jeden obiekt w JSON, zero zmian w kodzie. `src/agents.js` to tylko cienki reader tego pliku.

```json
{
  "claude": {
    "name": "Claude Code",
    "detect": ["CLAUDE.md", ".claude/"],
    "targets": {
      "project": { "skills_dir": ".claude/skills", "rules_dir": ".claude/rules", "rules_file": "CLAUDE.md" },
      "global":  { "skills_dir": "~/.claude/skills", "rules_dir": "~/.claude/rules", "rules_file": "~/.claude/CLAUDE.md" }
    }
  },
  "cursor": { "name": "Cursor", "detect": [".cursor/"], "targets": { "project": { "...": "..." }, "global": { "...": "..." } } },
  "codex":  { "name": "Codex CLI", "detect": ["AGENTS.md", ".codex/"], "targets": { "project": { "...": "..." }, "global": { "...": "..." } } }
}
```

### Mapowanie artefakt → katalogi docelowe (project scope)

Skill to **folder** (`SKILL.md` + opcjonalne `scripts/`, `references/`, `assets/`), nie sam plik — instalator kopiuje cały folder skilla.

| Artefakt źródłowy                  | Claude Code                      | Cursor                           | Codex                            |
| ---------------------------------- | -------------------------------- | -------------------------------- | -------------------------------- |
| `content/skills/<n>/` (folder)     | `.claude/skills/<n>/`            | `.cursor/skills/<n>/`            | `.agents/skills/<n>/`            |
| `content/rules/CLAUDE.md`          | `CLAUDE.md` (root)               | —                                | —                                |
| `content/rules/AGENTS.md`          | —                                | `AGENTS.md` (root)               | `AGENTS.md` (root)               |
| `content/rules/cursor/*.mdc`       | —                                | `.cursor/rules/*.mdc`            | —                                |
| `content/prompts/<n>.md`           | `.claude/commands/<n>.md`        | `.cursor/prompts/<n>.md`         | ⚠ do zweryfikowania              |

### Scope: project vs global

Poza domyślnym `project` (zapis do `process.cwd()`), instalator wspiera `global` (zapis do `homedir()`). **Wszystkie trzy natywne global paths są oficjalnie wspierane** ([Cursor docs](https://cursor.com/docs/skills)):
- Claude Code: `~/.claude/skills/`, `~/.claude/CLAUDE.md`
- Cursor: `~/.cursor/skills/` oraz `~/.agents/skills/` (Cursor ładuje też `.claude/skills/` i `.codex/skills/` dla kompatybilności)
- Codex: `~/.codex/skills/`

Jedyna pułapka global: `expandTilde()` dla ścieżek z `~/` cross-platform.

Optymalizacja (opcjonalna, na później): Cursor czyta `.agents/skills/`, `.cursor/skills/`, `.claude/skills/` i `.codex/skills/`, więc przy install `--all` można pisać skille do 2 kopii zamiast 3. **Dla MVP** polecam proste „kopiuj do natywnego katalogu każdego wybranego agenta" — duplikacja markdown jest tania, a model mentalny czysty.

### SKILL.md frontmatter (standard)

Wymagane: `name` (musi pasować do nazwy folderu), `description`. Opcjonalne:
- `paths` — globy scope'ujące skill do plików (np. `paths: "**/*.php"` → skill aktywny tylko przy plikach PHP). **To natywny mechanizm stack-scopingu** — lepszy niż osobny `skills.json`.
- `disable-model-invocation: true` — skill tylko przez `/skill-name`, nie auto-invoked.
- `metadata` — dowolne key-value (np. tagi, wersja).
- `paths` zastępuje legacy `globs`.

⚠ Otwarte punkty do zweryfikowania przed implementacją: (a) czy Codex ma odpowiednik slash-command dla `prompts/`; (b) dokładne ścieżki discover dla Claude Code/Codex (Cursor potwierdzony docsami).

---

## 4. CLI design

Jeden bin z subkomendami (czystsze niż osobne pliki, łatwiej rozszerzyć):

```
ai-toolkit install [--agent claude,cursor,codex|all] [--scope project|global|both] [--stack <s>] [--skill <n>] [--rule <n>] [--prompt <n>] [--yes] [--force] [--dry-run] [--target <path>]
ai-toolkit uninstall [--yes]
ai-toolkit update                 # re-instaluje z najnowszej wersji paczki (npx pobiera latest)
ai-toolkit list                   # co jest w tej wersji paczki
ai-toolkit doctor                 # auth ok? node? co zainstalowane? drift hashy?
```

### Interaktywny flow (gdy brak flag i wykryto >1 narzędzie)

```
🔍 Stack: php
🔍 Wykryto narzędzia: Claude Code, Cursor

Wykryto wiele narzędzi. Wybierz:
  [1] Tylko Claude Code
  [2] Tylko Cursor
  [a] Wszystkie wykryte (claude, cursor)
Wybierz [1-2 / a]: a

Instalacja w: [1] projekcie  [2] globalnie  [3] obie?  [1]: 1

📦 Skills: code-review
📋 Rules: kopiuję wszystkie
🎯 Narzędzia: Claude Code, Cursor
📁 Scope: project

Kontynuować? [Y/n]: y
  ✓ .claude/skills/code-review/SKILL.md
  ✓ .claude/rules/CLAUDE.md
  ✓ CLAUDE.md
  ✓ .cursor/skills/code-review/SKILL.md
✅ Gotowe. Skopiowano 5 plik(ów).
```

W CI/skryptach: `--yes` wyłącza prompty, wszystkie decyzje przez flagi (`--agent`, `--scope`).

`bin/cli.js` (cienka warstwa):

```js
#!/usr/bin/env node
import { install } from '../src/install.js';
import { uninstall } from '../src/uninstall.js';
import { update } from '../src/update.js';
import { doctor } from '../src/doctor.js';

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case 'install':   await install(parseArgs(args)); break;
  case 'uninstall': await uninstall(parseArgs(args)); break;
  case 'update':    await update(parseArgs(args)); break;
  case 'doctor':    await doctor(parseArgs(args)); break;
  default: printUsage();
}
```

---

## 5. Manifest i idempotencja

Bez manifestu `uninstall` i `update` są niebezpieczne (skasują plik użytkownika). Lokalizacja: `.ai-toolkit/manifest.json` w projekcie docelowym:

```json
{
  "version": "1.2.0",
  "installedAt": "2026-07-01T07:34:00Z",
  "agents": ["claude", "cursor", "codex"],
  "files": [
    {
      "src": "content/skills/code-review/SKILL.md",
      "dest": ".claude/skills/code-review/SKILL.md",
      "hash": "sha256:...",
      "agent": "claude"
    }
  ]
}
```

### Strategia konfliktów (kluczowa decyzja projektowa)

| Stan dest                                    | Domyślnie        | `--force`   | `--yes` (CI)        |
| -------------------------------------------- | ---------------- | ----------- | ------------------- |
| nie istnieje                                 | kopiuj           | kopiuj      | kopiuj              |
| istnieje, hash == manifest (nasz, niezmien.) | nadpisz (update) | nadpisz     | nadpisz             |
| istnieje, nie ma w manifeście (plik usera)   | zapytaj: skip/backup/overwrite | nadpisz | skip + warning |
| istnieje, hash ≠ manifest (user modyfikował) | zapytaj: skip/backup/overwrite | nadpisz | skip + warning |

Backup do `.ai-toolkit/backups/<timestamp>/`. `--dry-run` pokazuje, co zostanie skopiowane, bez zapisu.

**Decyzja:** commitować manifest w projektach docelowych? **Tak, zalecam** — team dzieli wersję toolkitu, widać w PR. Same artefakty też commitowane (agenty muszą je widzieć).

### Flow `install.js` krok po kroku

1. Resolve bundlowanego `content/` (przez `fileURLToPath(import.meta.url)`).
2. Wykryj agentów: flaga `--agent` → jeśli nie podano, domyślnie wszyscy trzej (lub detekcja po `.cursor/`, `.claude/`, `AGENTS.md`).
3. Wczytaj istniejący manifest, jeśli jest.
4. Dla każdego artefaktu × agenta z macierzy:
   - oblicz docelową ścieżkę w `process.cwd()` (lub `--target`);
   - zastosuj reguły konfliktu (tabela wyżej);
   - skopiuj (`fs.cpSync` z `recursive:true`, Node 20+), zapisz hash sha256, dodaj wpis do nowego manifestu.
5. Zapisz `.ai-toolkit/manifest.json`.
6. Printuj podsumowanie (co zainstalowano, gdzie, jakie backupy, wersja).

---

## 6. Autoryzacja — org-only (korekta z propose-g, kluczowe)

GitHub Packages dziedziczy uprawnienia z repo/org — osoby spoza org nie pobiorą paczki. **Ale same `gh auth login` NIE wystarczy dla `npx`.** npm musi mieć ustawiony scope registry i token z `read:packages`, zwykle w `~/.npmrc`.

### Dla developerów (jednorazowo, dowolny stack)

**Opcja A — przez `gh` (najwygodniejsza):**

```bash
gh auth login
gh auth refresh -h github.com -s read:packages   # upewnij się, że scope jest
TOKEN=$(gh auth token)
printf "@twoja-org:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=%s\n" "$TOKEN" >> ~/.npmrc
```

**Opcja B — ręcznie z PAT:** username = GitHub username, password = PAT z `read:packages`, w `~/.npmrc`:

```ini
@twoja-org:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

**Opcja C — `.npmrc` w projekcie** (team-wide, z `${GITHUB_TOKEN}` w shellu/CI):

```ini
@twoja-org:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Globalny `~/.npmrc` działa dla wszystkich stacków (PHP, Elixir) — `npx` i tak używa npm do pobrania.

### `scripts/setup.sh` (dla non-JS devów, one-time)

```bash
curl -fsSL https://raw.githubusercontent.com/twoja-org/ai-toolkit/main/scripts/setup.sh | bash
```

Skrypt: sprawdza `node`, `gh`, scope `read:packages` (`gh auth status`), instruuje `gh auth refresh -h github.com -s read:packages` jeśli brak, pisze `~/.npmrc`. Po tym `npx -y @twoja-org/ai-toolkit install` „just works".

### Dla CI (publish)

`GITHUB_TOKEN` (wbudowany w Actions) z `permissions: packages: write, contents: read`. Nie PAT.

---

## 7. Publish workflow

```yaml
name: publish
on:
  push:
    tags: ["v*.*.*"]          # v1.2.0 → npm version 1.2.0
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://npm.pkg.github.com'
          scope: '@twoja-org'
      - run: npm ci
      - run: npm test          # testy instalatora (jeśli są)
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Po publikacji: **Package settings → Manage Actions access / org members** — domyślnie paczka dziedziczy uprawnienia z repo, ale zweryfikuj, że org members mają `read`.

**Wersjonowanie:** tag git `v1.2.0`. Zespół pinuje `@1.2.0` albo `@latest`. Breaking zmiana w macierzy docelowej = major bump.

---

## 8. Multi-stack (JS, PHP, Elixir, Python, Go, Rust)

`npx` działa w projekcie **bez `package.json`** — wystarczy Node na maszynie deva (u Was i tak jest przy JS). Instalator to standalone Node CLI, po instalacji projekt nie ma runtime dependency od Node.

### Stack detection (po markerach w cwd)

| Marker           | Stack   |
| ----------------- | ------- |
| `package.json`    | node    |
| `composer.json`   | php     |
| `mix.exs`         | elixir  |
| `go.mod`          | go      |
| `Cargo.toml`      | rust    |
| `pyproject.toml`  | python  |

Detekcja jest **info-only** (pokazuje `🔍 Stack: php` w prompcie). Na MVP nie wpływa na to, co się kopiuje — każdy stack dostaje ten sam zestaw (bo `SKILL.md` jest przenośny). Stack-scoping poszczególnych skilli robi się natywnie przez frontmatter `paths` (np. `paths: "**/*.php"`), bez osobnego pliku metadanych.

```bash
# PHP
cd ~/projects/my-laravel-app && npx -y @twoja-org/ai-toolkit install --agent cursor
# Elixir
cd ~/projects/my-phoenix-app && npx -y @twoja-org/ai-toolkit install --all
```

Nie próbuj na start robić `composer require` ani hex package — to osobne ekosystemy, a `npx` + copy obejmuje wszystkich. Tor „bez Node" (`curl | bash` ściągający tarball z GitHub Release) odłóż na v2/v3.

---

## 9. Pułapki (skonsolidowane)

| Problem                          | Rozwiązanie                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `npx` bez auth → 404/401         | Onboarding: `~/.npmrc` + `read:packages`; `setup.sh` do weryfikacji                          |
| `gh auth` bez `read:packages`    | `setup.sh`/`doctor` instruuje `gh auth refresh -h github.com -s read:packages`               |
| Nadpisanie lokalnych rules       | Domyślnie skip/zapytaj, `--force` explicit; backup do `.ai-toolkit/backups/`                 |
| Brak uninstall/update            | Manifest z hashami + lista skopiowanych plików                                               |
| Różne wersje w zespole           | Pin `@x.y.z` + commitowany `.ai-toolkit/manifest.json` w repo projektu                       |
| Merge `AGENTS.md`                | Na start **nie merge** — osobny plik lub copy tylko do `.cursor/rules/`; merge = v2          |
| Cursor zmienia ścieżki skills    | Macierz w `tools.json` wersjonowana — zmiana mapowania = minor bump                          |
| `~/.cursor/skills/` oficjalnie OK   | Potwierdzone [docs.cursor.com](https://cursor.com/docs/skills) — Cursor czyta `~/.cursor/skills/`, `~/.agents/skills/`, `~/.claude/skills/`, `~/.codex/skills/` |
| `npx` prompt „Ok to proceed?"    | W CI/skryptach dodawaj `-y`/`--yes`                                                          |
| Prompt npx bez TTY (CI)          | `--yes` w `install`, nigdy `prompt` jako domyślne w CI                                        |
| Scope nazwy ≠ org                | `@twoja-org/ai-toolkit` musi pasować do nazwy org na GitHubie; repo w tej samej org          |

---

## 10. Decyzje do podjęcia przed startem

1. **Scope nazwy paczki** — `@twoja-org/ai-toolkit` (musi pasować do nazwy org na GH).
2. **Commitować manifest w projektach docelowych?** — zalecam tak.
3. **Detekcja agentów czy domyślnie wszyscy?** — domyślnie wszyscy + `--agent` do zawężenia (prostsze UX).
4. **Czy reguły różnią się per agent?** — jeśli ta sama treść, trzymaj jedno źródło `content/rules/core.md` i mapuj na `CLAUDE.md` + `AGENTS.md`.
5. **Wymóg Node** — MVP tak; tor „bez Node" odłóż na v2.
6. **Strategia wersjonowania** — tagi `v*.*.*` + semver (breaking w macierzy = major).

---

## 11. Fazy wdrożenia

### Faza 0 — proof (1–2h): udowodnij round-trip GH Packages
1. Utwórz repo `ai-toolkit` w org, `package.json` ze scope, pusty `bin/cli.js` echo'ujący „hello".
2. Skonfiguruj `publish.yml`, opublikuj `v0.0.1`.
3. Z innego folderu (najlepiej projekt **bez** `package.json`, np. PHP) zrób one-time `.npmrc` z `gh auth token` i odpal `npx -y @twoja-org/ai-toolkit`.
4. **Cel:** udowodnić pełen round-trip publikacji i konsumpcji zanim napiszesz instalator. To zdejmie największą niepewność.

### Faza 1 — MVP copy installer (pół dnia)
1. `bin/cli.js` + `src/install.js` + `src/agents.js` (reader `tools.json`) + `src/stack.js` (detekcja) + `src/manifest.js`.
2. Tylko `install` i `uninstall`, tylko copy, tylko skill + `AGENTS.md`/`CLAUDE.md`. Jeden skill (`code-review`) jako prova.
3. Manifest z hashami, backup plików usera, `--yes`, `--force`, `--dry-run`, `--scope project|global`.
4. Interaktywny prompt (detekcja narzędzi + wybór agenta/scope) z fallbackiem na flagi w CI.
5. `setup.sh` + README z instrukcją one-time.
6. Test lokalny: `node bin/cli.js install --target ./test-project` (bez publish); `npm pack` żeby zweryfikować skład tarballa.

### Faza 2 — rozwój
1. `update`, `list`, `doctor` (drift detection).
2. Selektor `--agent`, `--skill`, `--rule`, `--prompt`, `--stack`.
3. Stack-scoping skilli przez natywny frontmatter `paths` (np. `paths: "**/*.php"`) zamiast osobnego `skills.json`; opcjonalny `metadata` w frontmatterze dla tagów/wersji.
4. Obsługa `prompts` i `.mdc` rules.
5. Testy: skład paczki → install do tmp dir → asercje na plikach i manifeście (Vitest/node:test).

### Faza 3 (opcjonalnie)
1. Tor „bez Node" przez `curl | bash` ściągający tarball z GitHub Release (nie Packages API — prostsze auth).
2. CI action instalująca toolkit w repo projektowym (deklaratywny `.ai-toolkit.yml`).
3. Walidacja artefaktów: lint frontmatteru `SKILL.md`, unikalność `name` skillów.

---

## 12. Minimalny MVP — co commitować w pierwszym PR

```
ai-toolkit/
├── package.json
├── bin/
│   └── cli.js
├── src/
│   ├── install.js
│   ├── uninstall.js
│   ├── manifest.js
│   ├── agents.js
│   ├── stack.js
│   └── copy.js
├── content/
│   ├── skills/code-review/SKILL.md
│   └── rules/
│       ├── AGENTS.md
│       └── CLAUDE.md
├── tools.json
├── scripts/setup.sh
├── test/install.test.js
└── .github/workflows/publish.yml
```

**Pierwszy milestone:** kolega z PHP uruchamia w swoim repo `npx -y @twoja-org/ai-toolkit@0.1.0 install` i widzi pliki w `.cursor/skills/` + `AGENTS.md`, bez dotykania `composer.json`.

---

## 13. Alternatywy (krótko)

- **Git submodule/subtree** — zero npm, ale gorszy UX i brak semver dla „paczki".
- **`curl | bash` z prywatnego raw + token** — prostsze, ale słabsza kontrola dostępu niż GH Packages.
- **Monorepo z wieloma `@twoja-org/ai-toolkit-*`** — sensowne dopiero przy dużej liczbie zestawów (security-review, php, elixir).

Dla firmowego narzędzia **jedna paczka + macierz profili per agent** to najlepszy start.
