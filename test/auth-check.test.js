import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function runCheckAuth(home) {
  const result = spawnSync(
    "node",
    [
      "--input-type=module",
      "-e",
      "import { checkAuth } from './src/auth-check.js'; console.log(JSON.stringify(checkAuth()));",
    ],
    {
      cwd: ROOT,
      env: { ...process.env, HOME: home },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

test("checkAuth returns ok false when npmrc is missing", () => {
  const home = mkdtempSync(join(tmpdir(), "ai-toolkit-auth-"));
  try {
    const result = runCheckAuth(home);
    assert.equal(result.ok, false);
    assert.match(result.message, /Missing ~\/\.npmrc/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("checkAuth returns ok false when npmrc lacks scope or token", () => {
  const home = mkdtempSync(join(tmpdir(), "ai-toolkit-auth-"));
  try {
    writeFileSync(join(home, ".npmrc"), "@mraubo:registry=https://npm.pkg.github.com\n");
    const result = runCheckAuth(home);
    assert.equal(result.ok, false);
    assert.match(result.message, /missing @mraubo registry or token/i);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
