import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { test } from "node:test";

import {
  getRulesSourceFile,
  resolveTarget,
} from "../src/agents.js";

test("getRulesSourceFile maps agents to rules files", () => {
  assert.equal(getRulesSourceFile("claude"), "CLAUDE.md");
  assert.equal(getRulesSourceFile("cursor"), "AGENTS.md");
  assert.equal(getRulesSourceFile("codex"), "AGENTS.md");
});

test("resolveTarget maps codex skills to project and global paths", () => {
  const project = mkdtempSync(join(tmpdir(), "ai-toolkit-agents-"));
  try {
    assert.equal(
      resolveTarget("codex", "project", "skills", project),
      join(project, ".agents/skills"),
    );
    assert.equal(
      resolveTarget("codex", "global", "skills", project),
      join(homedir(), ".agents/skills"),
    );
    assert.equal(
      resolveTarget("codex", "project", "rules", project),
      join(project, "AGENTS.md"),
    );
    assert.equal(
      resolveTarget("codex", "global", "rules", project),
      join(homedir(), "AGENTS.md"),
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("resolveTarget throws for unknown agent", () => {
  assert.throws(
    () => resolveTarget("unknown", "project", "skills", "/tmp"),
    /Unknown agent: unknown/,
  );
});
