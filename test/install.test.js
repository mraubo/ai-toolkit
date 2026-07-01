import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "bin/cli.js");

function runInstall(args, cwd) {
  return spawnSync("node", [CLI, "install", ...args], {
    cwd,
    encoding: "utf8",
  });
}

function runUninstall(args, cwd) {
  return spawnSync("node", [CLI, "uninstall", ...args], {
    cwd,
    encoding: "utf8",
  });
}

function tempProject() {
  return mkdtempSync(join(tmpdir(), "ai-toolkit-test-"));
}

function assertManifestValid(manifestPath) {
  assert.ok(existsSync(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.ok(manifest.version);
  assert.ok(manifest.installedAt);
  assert.ok(Array.isArray(manifest.agents));
  assert.ok(Array.isArray(manifest.files));
  for (const file of manifest.files) {
    assert.match(file.hash, /^sha256:[a-f0-9]{64}$/);
    assert.ok(file.dest);
    assert.ok(file.src);
    assert.ok(file.agent);
  }
  return manifest;
}

test("install and uninstall round-trip (cursor, project scope)", () => {
  const project = tempProject();
  try {
    const install = runInstall(
      ["--yes", "--agent", "cursor", "--scope", "project"],
      project,
    );
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const skillPath = join(project, ".cursor/skills/code-review/SKILL.md");
    const rulesPath = join(project, "AGENTS.md");
    const manifestPath = join(project, ".ai-toolkit/manifest.json");

    assert.ok(existsSync(skillPath));
    assert.ok(existsSync(rulesPath));
    const manifest = assertManifestValid(manifestPath);
    assert.equal(manifest.agents.includes("cursor"), true);
    assert.equal(manifest.files.length, 2);

    const uninstall = runUninstall(["--yes"], project);
    assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout);
    assert.equal(existsSync(skillPath), false);
    assert.equal(existsSync(rulesPath), false);
    assert.equal(existsSync(manifestPath), false);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("creates AGENTS.md when missing (--yes)", () => {
  const project = tempProject();
  try {
    const install = runInstall(
      ["--yes", "--agent", "cursor", "--scope", "project"],
      project,
    );
    assert.equal(install.status, 0, install.stderr || install.stdout);
    assert.match(install.stdout, /Creating AGENTS\.md/);
    assert.match(readFileSync(join(project, "AGENTS.md"), "utf8"), /Team Engineering Conventions/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("creates CLAUDE.md when missing (--yes, claude agent)", () => {
  const project = tempProject();
  try {
    const install = runInstall(
      ["--yes", "--agent", "claude", "--scope", "project"],
      project,
    );
    assert.equal(install.status, 0, install.stderr || install.stdout);
    assert.match(install.stdout, /Creating CLAUDE\.md/);
    assert.match(readFileSync(join(project, "CLAUDE.md"), "utf8"), /Team Engineering Conventions/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("creates AGENTS.md when file is empty (--yes)", () => {
  const project = tempProject();
  try {
    writeFileSync(join(project, "AGENTS.md"), "   \n", "utf8");

    const install = runInstall(
      ["--yes", "--agent", "cursor", "--scope", "project"],
      project,
    );
    assert.equal(install.status, 0, install.stderr || install.stdout);
    assert.match(readFileSync(join(project, "AGENTS.md"), "utf8"), /Team Engineering Conventions/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("--yes skips user-owned AGENTS.md with warning", () => {
  const project = tempProject();
  try {
    writeFileSync(join(project, "AGENTS.md"), "# user-owned\n", "utf8");

    const install = runInstall(
      ["--yes", "--agent", "cursor", "--scope", "project"],
      project,
    );
    assert.equal(install.status, 0, install.stderr || install.stdout);
    assert.match(install.stderr + install.stdout, /Skipping AGENTS\.md.*already exists/);
    assert.equal(readFileSync(join(project, "AGENTS.md"), "utf8"), "# user-owned\n");
    assert.ok(existsSync(join(project, ".cursor/skills/code-review/SKILL.md")));
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("--force overwrites user-owned AGENTS.md and records hash in manifest", () => {
  const project = tempProject();
  try {
    writeFileSync(join(project, "AGENTS.md"), "# user-owned\n", "utf8");

    const install = runInstall(
      ["--yes", "--force", "--agent", "cursor", "--scope", "project"],
      project,
    );
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const content = readFileSync(join(project, "AGENTS.md"), "utf8");
    assert.match(content, /Team Engineering Conventions/);

    const manifest = assertManifestValid(
      join(project, ".ai-toolkit/manifest.json"),
    );
    const rulesEntry = manifest.files.find((f) => f.dest.endsWith("AGENTS.md"));
    assert.ok(rulesEntry);
    assert.equal(rulesEntry.hash, rulesEntry.hash);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("--dry-run lists copies without writing files", () => {
  const project = tempProject();
  try {
    const install = runInstall(
      ["--dry-run", "--yes", "--agent", "cursor", "--scope", "project"],
      project,
    );
    assert.equal(install.status, 0, install.stderr || install.stdout);
    assert.match(install.stdout, /Dry run/);
    assert.match(install.stdout, /→/);
    assert.equal(existsSync(join(project, ".cursor/skills/code-review/SKILL.md")), false);
    assert.equal(existsSync(join(project, ".ai-toolkit/manifest.json")), false);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("re-install is idempotent (no duplicate manifest entries)", () => {
  const project = tempProject();
  try {
    const args = ["--yes", "--force", "--agent", "cursor", "--scope", "project"];
    assert.equal(runInstall(args, project).status, 0);
    const first = assertManifestValid(join(project, ".ai-toolkit/manifest.json"));
    assert.equal(runInstall(args, project).status, 0);
    const second = assertManifestValid(join(project, ".ai-toolkit/manifest.json"));
    assert.equal(first.files.length, second.files.length);
    const dests = second.files.map((f) => f.dest);
    assert.equal(new Set(dests).size, dests.length);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
