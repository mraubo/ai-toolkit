import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  detectAgents,
  getAgentName,
  getPackageRoot,
  listAgentIds,
  resolveTarget,
} from "./agents.js";
import { copyArtifact, hashFile } from "./copy.js";
import { writeManifest } from "./manifest.js";
import { confirm, prompt } from "./prompt.js";
import { detectStack } from "./stack.js";

const pkg = JSON.parse(
  readFileSync(join(getPackageRoot(), "package.json"), "utf8"),
);

const RULES_BY_AGENT = {
  claude: "CLAUDE.md",
  cursor: "AGENTS.md",
};

function parseAgentFlag(value) {
  if (!value || value === "all") return null;
  return value.split(",").map((a) => a.trim()).filter(Boolean);
}

function parseScopeFlag(value) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (["project", "global", "both"].includes(normalized)) return normalized;
  throw new Error(`Invalid scope: ${value}`);
}

function scopesForChoice(scope) {
  if (scope === "both") return ["project", "global"];
  return [scope];
}

async function selectAgents(cwd, flags) {
  const fromFlag = parseAgentFlag(flags.agent);
  if (fromFlag) return fromFlag;

  const detected = detectAgents(cwd);
  if (detected.length === 1) return detected;

  if (flags.yes) {
    return detected.length > 0 ? detected : listAgentIds();
  }

  if (detected.length === 0) {
    console.log("No agent markers detected. Available agents:");
    const ids = listAgentIds();
    ids.forEach((id, i) => console.log(`  [${i + 1}] ${getAgentName(id)}`));
    const answer = await prompt(`Select agent [1-${ids.length}]: `);
    const index = Number.parseInt(answer, 10) - 1;
    if (index >= 0 && index < ids.length) return [ids[index]];
    throw new Error("Invalid agent selection");
  }

  console.log("\nMultiple agents detected. Select:");
  detected.forEach((id, i) => console.log(`  [${i + 1}] ${getAgentName(id)} only`));
  console.log("  [a] All detected");
  const answer = await prompt(`Choose [1-${detected.length} / a]: `);
  if (answer.toLowerCase() === "a") return detected;
  const index = Number.parseInt(answer, 10) - 1;
  if (index >= 0 && index < detected.length) return [detected[index]];
  throw new Error("Invalid agent selection");
}

async function selectScope(flags) {
  const fromFlag = parseScopeFlag(flags.scope);
  if (fromFlag) return fromFlag;

  if (flags.yes) return "project";

  console.log("\nInstall scope:");
  console.log("  [1] Project");
  console.log("  [2] Global");
  console.log("  [3] Both");
  const answer = await prompt("Choose [1-3]: ");
  if (answer === "2") return "global";
  if (answer === "3") return "both";
  return "project";
}

function listSkillNames(contentDir) {
  const skillsRoot = join(contentDir, "skills");
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function collectSkillFiles(skillDir) {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  }
  walk(skillDir);
  return files;
}

export async function install(flags = {}) {
  const target = flags.target ? resolve(process.cwd(), flags.target) : process.cwd();
  const contentDir = join(getPackageRoot(), "content");
  const stack = detectStack(target);

  console.log(`🔍 Stack: ${stack}`);

  const agents = await selectAgents(target, flags);
  const scope = await selectScope(flags);
  const skillNames = listSkillNames(contentDir);

  console.log(`\n📦 Skills: ${skillNames.join(", ") || "(none)"}`);
  console.log(`📋 Rules: copying agent-specific rules`);
  console.log(`🎯 Agents: ${agents.map(getAgentName).join(", ")}`);
  console.log(`📁 Scope: ${scope}`);

  if (!flags.yes) {
    const ok = await confirm("\nContinue?", true);
    if (!ok) {
      console.log("Install cancelled.");
      return;
    }
  }

  const manifestFiles = [];
  const manifestAgents = [...new Set(agents)];

  for (const agent of agents) {
    const rulesFile = RULES_BY_AGENT[agent];
    if (!rulesFile) continue;

    for (const scopeChoice of scopesForChoice(scope)) {
      const skillsDestRoot = resolveTarget(agent, scopeChoice, "skills", target);

      for (const skillName of skillNames) {
        const src = join(contentDir, "skills", skillName);
        const dest = join(skillsDestRoot, skillName);
        copyArtifact(src, dest);
        console.log(`  ✓ ${dest}`);

        for (const file of collectSkillFiles(dest)) {
          manifestFiles.push({
            src: join("content/skills", skillName, file.slice(dest.length + 1)),
            dest: file,
            hash: hashFile(file),
            agent,
          });
        }
      }

      const rulesSrc = join(contentDir, "rules", rulesFile);
      const rulesDest = resolveTarget(agent, scopeChoice, "rules", target);
      if (existsSync(rulesSrc)) {
        copyArtifact(rulesSrc, rulesDest);
        console.log(`  ✓ ${rulesDest}`);
        manifestFiles.push({
          src: join("content/rules", rulesFile),
          dest: rulesDest,
          hash: hashFile(rulesDest),
          agent,
        });
      }
    }
  }

  writeManifest(target, {
    version: pkg.version,
    installedAt: new Date().toISOString(),
    agents: manifestAgents,
    files: manifestFiles,
  });

  console.log(`\n✅ Done. Copied ${manifestFiles.length} file(s).`);
}
