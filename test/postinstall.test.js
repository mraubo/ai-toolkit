import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POSTINSTALL = join(ROOT, "scripts/postinstall.js");

function runPostinstall(env, cwd) {
  return spawnSync("node", [POSTINSTALL], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function tempProject() {
  return mkdtempSync(join(tmpdir(), "ai-toolkit-postinstall-"));
}

test("postinstall exits 0 without env gate and writes nothing", () => {
  const project = tempProject();
  try {
    const result = runPostinstall({ AI_TOOLKIT_AUTO_INSTALL: undefined }, project);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const manifestPath = join(project, ".ai-toolkit/manifest.json");
    assert.equal(existsSync(manifestPath), false);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("postinstall with AI_TOOLKIT_AUTO_INSTALL=1 runs install in INIT_CWD", () => {
  const project = tempProject();
  try {
    const result = runPostinstall(
      {
        AI_TOOLKIT_AUTO_INSTALL: "1",
        INIT_CWD: project,
      },
      project,
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const manifestPath = join(project, ".ai-toolkit/manifest.json");
    assert.ok(existsSync(manifestPath), "manifest should exist after auto-install");

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.ok(manifest.agents.length > 0);
    assert.ok(manifest.files.length > 0);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("postinstall via npm install with file dependency and env gate", () => {
  const consumer = tempProject();
  try {
    writeFileSync(
      join(consumer, "package.json"),
      JSON.stringify(
        {
          name: "ai-toolkit-consumer-test",
          private: true,
          dependencies: {
            "@mraubo/ai-toolkit": `file:${ROOT}`,
          },
        },
        null,
        2,
      ),
    );

    const npmInstall = spawnSync("npm", ["install", "--ignore-scripts"], {
      cwd: consumer,
      encoding: "utf8",
    });
    assert.equal(npmInstall.status, 0, npmInstall.stderr || npmInstall.stdout);

    const postinstall = spawnSync(
      "node",
      [join(consumer, "node_modules/@mraubo/ai-toolkit/scripts/postinstall.js")],
      {
        cwd: consumer,
        env: {
          ...process.env,
          AI_TOOLKIT_AUTO_INSTALL: "1",
          INIT_CWD: consumer,
        },
        encoding: "utf8",
      },
    );
    assert.equal(postinstall.status, 0, postinstall.stderr || postinstall.stdout);

    const manifestPath = join(consumer, ".ai-toolkit/manifest.json");
    assert.ok(existsSync(manifestPath));
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }
});
