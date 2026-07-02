import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "bin/cli.js");

function runCli(args, cwd, env = {}) {
  return spawnSync("node", [CLI, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function tempProject() {
  return mkdtempSync(join(tmpdir(), "ai-toolkit-test-"));
}

function configuredHome() {
  const home = mkdtempSync(join(tmpdir(), "ai-toolkit-home-"));
  writeFileSync(
    join(home, ".npmrc"),
    "@mraubo:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=test-token\n",
  );
  return home;
}

test("list outputs bundled code-review skill", () => {
  const result = runCli(["list"], ROOT);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /code-review/);
  assert.match(result.stdout, /Skills/);
});

test("list --installed shows checkmarks after install", () => {
  const project = tempProject();
  try {
    const install = runCli(
      ["install", "--yes", "--agent", "cursor", "--scope", "project"],
      project,
    );
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const result = runCli(["list", "--installed", "--target", project], project);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /\[✓\] code-review/);
    assert.match(result.stdout, /\[✓\] AGENTS\.md/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("doctor warns when manifest missing", () => {
  const project = tempProject();
  try {
    const result = runCli(["doctor", "--target", project], project);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /No .ai-toolkit\/manifest\.json/);
    assert.doesNotMatch(output, /Hash drift/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("doctor passes after install", () => {
  const project = tempProject();
  const home = configuredHome();
  try {
    const install = runCli(
      ["install", "--yes", "--agent", "cursor", "--scope", "project"],
      project,
    );
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const result = runCli(["doctor", "--target", project], project, { HOME: home });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /All checks passed/);
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("update --yes is idempotent on unchanged content", () => {
  const project = tempProject();
  try {
    const install = runCli(
      ["install", "--yes", "--agent", "cursor", "--scope", "project"],
      project,
    );
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const manifestPath = join(project, ".ai-toolkit/manifest.json");
    const before = JSON.parse(readFileSync(manifestPath, "utf8"));

    const update = runCli(["update", "--yes", "--target", project], project);
    assert.equal(update.status, 0, update.stderr || update.stdout);

    const after = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(before.files.length, after.files.length);
    for (const file of before.files) {
      const match = after.files.find((f) => f.dest === file.dest);
      assert.ok(match);
      assert.equal(match.hash, file.hash);
    }
    assert.ok(existsSync(join(project, ".cursor/skills/code-review/SKILL.md")));
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("update exits 1 when manifest missing", () => {
  const project = tempProject();
  try {
    const result = runCli(["update", "--yes", "--target", project], project);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no manifest found/i);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("update after skill-only install does not add rules", () => {
  const project = tempProject();
  try {
    const install = runCli(
      [
        "install",
        "--yes",
        "--agent",
        "cursor",
        "--scope",
        "project",
        "--skill",
        "code-review",
      ],
      project,
    );
    assert.equal(install.status, 0, install.stderr || install.stdout);
    assert.equal(existsSync(join(project, "AGENTS.md")), false);

    const update = runCli(["update", "--yes", "--target", project], project);
    assert.equal(update.status, 0, update.stderr || update.stdout);
    assert.equal(existsSync(join(project, "AGENTS.md")), false);
    assert.ok(existsSync(join(project, ".cursor/skills/code-review/SKILL.md")));
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
