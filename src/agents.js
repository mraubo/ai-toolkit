import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { expandTilde } from "./copy.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const TARGET_KEYS = {
  skills: "skills_dir",
  rules: "rules_file",
  commands: "commands_dir",
  prompts: "prompts_dir",
  rules_dir: "rules_dir",
};

let toolsCache;

export function loadTools() {
  if (!toolsCache) {
    const raw = readFileSync(join(packageRoot, "tools.json"), "utf8");
    toolsCache = JSON.parse(raw);
  }
  return toolsCache;
}

export function getPackageRoot() {
  return packageRoot;
}

export function detectAgents(cwd) {
  const tools = loadTools();
  const detected = [];

  for (const [id, config] of Object.entries(tools)) {
    const found = config.detect.some((marker) => {
      const path = join(cwd, marker.endsWith("/") ? marker.slice(0, -1) : marker);
      return existsSync(path);
    });
    if (found) detected.push(id);
  }

  return detected;
}

export function resolveTarget(agent, scope, artifactType, baseDir) {
  const tools = loadTools();
  const config = tools[agent];
  if (!config) {
    throw new Error(`Unknown agent: ${agent}`);
  }

  const scopeConfig = config.targets[scope];
  if (!scopeConfig) {
    throw new Error(`Unknown scope: ${scope}`);
  }

  const key = TARGET_KEYS[artifactType];
  if (!key) {
    throw new Error(`Unknown artifact type: ${artifactType}`);
  }

  const relative = scopeConfig[key];
  if (!relative) {
    throw new Error(`Agent ${agent} has no ${artifactType} target for scope ${scope}`);
  }

  if (scope === "global" || relative.startsWith("~/")) {
    return expandTilde(relative);
  }

  return join(baseDir, relative);
}

export function listAgentIds() {
  return Object.keys(loadTools());
}

export function getAgentName(agentId) {
  return loadTools()[agentId]?.name ?? agentId;
}

export function getRulesSourceFile(agent) {
  if (agent === "claude") return "CLAUDE.md";
  if (agent === "cursor" || agent === "codex") return "AGENTS.md";
  throw new Error(`Unknown agent: ${agent}`);
}
