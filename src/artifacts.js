import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

function parseListFlag(flags, key) {
  if (!flags[key]) return null;
  return flags[key]
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function validateNames(requested, available, kind) {
  const unknown = requested.filter((name) => !available.includes(name));
  if (unknown.length > 0) {
    throw new Error(`Unknown ${kind}: ${unknown.join(", ")}`);
  }
  return requested;
}

export function listBundledArtifacts(contentDir) {
  const skills = [];
  const skillsRoot = join(contentDir, "skills");
  if (existsSync(skillsRoot)) {
    for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) skills.push(entry.name);
    }
  }

  const rules = [];
  const mdcRules = [];
  const rulesRoot = join(contentDir, "rules");
  if (existsSync(rulesRoot)) {
    for (const entry of readdirSync(rulesRoot, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        rules.push(entry.name);
      }
    }
    const cursorRulesDir = join(rulesRoot, "cursor");
    if (existsSync(cursorRulesDir)) {
      for (const entry of readdirSync(cursorRulesDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".mdc")) {
          mdcRules.push(entry.name.replace(/\.mdc$/, ""));
        }
      }
    }
  }

  const prompts = [];
  const promptsRoot = join(contentDir, "prompts");
  if (existsSync(promptsRoot)) {
    for (const entry of readdirSync(promptsRoot, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        prompts.push(entry.name.replace(/\.md$/, ""));
      }
    }
  }

  return { skills, rules, prompts, mdcRules };
}

function resolveRuleSelection(requested, bundled) {
  const mdRules = [];
  const mdcRules = [];

  for (const name of requested) {
    if (bundled.rules.includes(name)) {
      mdRules.push(name);
      continue;
    }

    const mdcName = name.startsWith("cursor/")
      ? name.slice("cursor/".length).replace(/\.mdc$/, "")
      : name.replace(/\.mdc$/, "");

    if (bundled.mdcRules.includes(mdcName)) {
      mdcRules.push(mdcName);
      continue;
    }

    throw new Error(`Unknown rule: ${name}`);
  }

  return { mdRules, mdcRules };
}

export function resolveArtifacts(flags, contentDir) {
  const bundled = listBundledArtifacts(contentDir);
  const hasGranular = Boolean(flags.skill || flags.rule || flags.prompt);

  if (!hasGranular) {
    return {
      skills: [...bundled.skills],
      mdRules: [...bundled.rules],
      mdcRules: [...bundled.mdcRules],
      prompts: [...bundled.prompts],
    };
  }

  const skills = flags.skill
    ? validateNames(parseListFlag(flags, "skill"), bundled.skills, "skill")
    : [];
  const prompts = flags.prompt
    ? validateNames(parseListFlag(flags, "prompt"), bundled.prompts, "prompt")
    : [];

  let mdRules = [];
  let mdcRules = [];
  if (flags.rule) {
    ({ mdRules, mdcRules } = resolveRuleSelection(parseListFlag(flags, "rule"), bundled));
  }

  return { skills, mdRules, mdcRules, prompts };
}
