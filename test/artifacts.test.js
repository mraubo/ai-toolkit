import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { listBundledArtifacts, resolveArtifacts } from "../src/artifacts.js";
import { getPackageRoot } from "../src/agents.js";

const CONTENT_DIR = join(getPackageRoot(), "content");

test("listBundledArtifacts includes bundled skills, rules, prompts, and mdc", () => {
  const bundled = listBundledArtifacts(CONTENT_DIR);
  assert.ok(bundled.skills.includes("code-review"));
  assert.ok(bundled.rules.includes("AGENTS.md"));
  assert.ok(bundled.prompts.includes("pr-review"));
  assert.ok(bundled.mdcRules.includes("typescript"));
});

test("resolveArtifacts returns all artifacts when no granular flags", () => {
  const artifacts = resolveArtifacts({}, CONTENT_DIR);
  assert.ok(artifacts.skills.includes("code-review"));
  assert.ok(artifacts.mdRules.includes("AGENTS.md"));
  assert.ok(artifacts.prompts.includes("pr-review"));
  assert.ok(artifacts.mdcRules.includes("typescript"));
});

test("resolveArtifacts installs only skill when --skill is set", () => {
  const artifacts = resolveArtifacts({ skill: "code-review" }, CONTENT_DIR);
  assert.deepEqual(artifacts.skills, ["code-review"]);
  assert.deepEqual(artifacts.mdRules, []);
  assert.deepEqual(artifacts.mdcRules, []);
  assert.deepEqual(artifacts.prompts, []);
});

test("resolveArtifacts throws on unknown skill", () => {
  assert.throws(
    () => resolveArtifacts({ skill: "missing-skill" }, CONTENT_DIR),
    /Unknown skill: missing-skill/,
  );
});

test("resolveArtifacts resolves mdc rule by basename", () => {
  const artifacts = resolveArtifacts({ rule: "typescript" }, CONTENT_DIR);
  assert.deepEqual(artifacts.mdcRules, ["typescript"]);
  assert.deepEqual(artifacts.mdRules, []);
});

test("resolveArtifacts throws on unknown rule", () => {
  assert.throws(
    () => resolveArtifacts({ rule: "code-review" }, CONTENT_DIR),
    /Unknown rule: code-review/,
  );
});
