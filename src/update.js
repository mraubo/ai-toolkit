import { homedir } from "node:os";
import { resolve, sep } from "node:path";

import { install } from "./install.js";
import { readManifest, writeManifest } from "./manifest.js";

function isUnderPath(path, base) {
  const resolvedPath = resolve(path);
  const resolvedBase = resolve(base);
  if (resolvedPath === resolvedBase) return true;
  return resolvedPath.startsWith(`${resolvedBase}${sep}`);
}

function inferScope(manifest, target) {
  const home = homedir();
  let hasProject = false;
  let hasGlobal = false;

  for (const entry of manifest.files ?? []) {
    const dest = entry.dest;
    if (isUnderPath(dest, target)) {
      hasProject = true;
    } else if (isUnderPath(dest, home)) {
      hasGlobal = true;
    }
  }

  if (hasProject && hasGlobal) return "both";
  if (hasGlobal) return "global";
  return "project";
}

function inferArtifactFlags(manifest) {
  const skills = new Set();
  const mdRules = new Set();
  const mdcRules = new Set();
  const prompts = new Set();

  for (const entry of manifest.files ?? []) {
    const src = entry.src?.replace(/\\/g, "/");
    if (!src) continue;

    const skillMatch = src.match(/^content\/skills\/([^/]+)\//);
    if (skillMatch) {
      skills.add(skillMatch[1]);
      continue;
    }

    const ruleMatch = src.match(/^content\/rules\/([^/]+\.md)$/);
    if (ruleMatch) {
      mdRules.add(ruleMatch[1]);
      continue;
    }

    const mdcMatch = src.match(/^content\/rules\/cursor\/([^/]+)\.mdc$/);
    if (mdcMatch) {
      mdcRules.add(mdcMatch[1]);
      continue;
    }

    const promptMatch = src.match(/^content\/prompts\/([^/]+)\.md$/);
    if (promptMatch) {
      prompts.add(promptMatch[1]);
    }
  }

  if (skills.size === 0 && mdRules.size === 0 && mdcRules.size === 0 && prompts.size === 0) {
    return {};
  }

  const artifactFlags = {};
  if (skills.size > 0) artifactFlags.skill = [...skills].join(",");
  const rules = [...mdRules, ...mdcRules];
  if (rules.length > 0) artifactFlags.rule = rules.join(",");
  if (prompts.size > 0) artifactFlags.prompt = [...prompts].join(",");
  return artifactFlags;
}

export async function update(flags = {}) {
  const target = flags.target ? resolve(process.cwd(), flags.target) : process.cwd();
  const manifest = readManifest(target);

  if (!manifest) {
    console.error("ai-toolkit: no manifest found. Run `ai-toolkit install` first.");
    process.exit(1);
  }

  const agents = flags.agent ?? manifest.agents?.join(",");
  const scope = flags.scope ?? inferScope(manifest, target);
  const yes = flags.yes ?? !process.stdin.isTTY;
  const hasExplicitArtifacts = Boolean(flags.skill || flags.rule || flags.prompt);
  const artifactFlags = hasExplicitArtifacts ? {} : inferArtifactFlags(manifest);

  await install({
    ...flags,
    ...artifactFlags,
    agent: agents,
    scope,
    yes,
    target: flags.target,
  });

  const updated = readManifest(target);
  if (updated) {
    writeManifest(target, {
      ...updated,
      installedAt: new Date().toISOString(),
    });
  }
}
