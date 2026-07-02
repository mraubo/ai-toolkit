import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import {
  detectAgents,
  getAgentName,
  getPackageRoot,
  getRulesSourceFile,
  listAgentIds,
  resolveTarget,
} from "./agents.js";
import { resolveArtifacts } from "./artifacts.js";
import {
  conflictWarning,
  decideAction,
  getDirConflictState,
  getFileConflictState,
} from "./conflict.js";
import { backupFile, copyArtifact, hashFile } from "./copy.js";
import {
  mergeAgents,
  readManifest,
  upsertFileEntry,
  writeManifest,
} from "./manifest.js";
import { confirm, closePrompts, prompt } from "./prompt.js";
import { mergeRulesFile, writeMergedRules } from "./rules-merge.js";
import { detectStack } from "./stack.js";

const pkg = JSON.parse(
  readFileSync(join(getPackageRoot(), "package.json"), "utf8"),
);

function parseAgentFlag(value) {
  if (!value) return null;
  if (value === "all") return listAgentIds();
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

function getPromptArtifactType(agent) {
  if (agent === "claude") return "commands";
  if (agent === "cursor") return "prompts";
  return null;
}

async function selectAgents(cwd, flags) {
  const fromFlag = parseAgentFlag(flags.agent);
  if (fromFlag) return fromFlag;

  const detected = detectAgents(cwd);
  if (detected.length === 1) return detected;

  if (flags.yes || flags["dry-run"]) {
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

  if (flags.yes || flags["dry-run"]) return "project";

  console.log("\nInstall scope:");
  console.log("  [1] Project");
  console.log("  [2] Global");
  console.log("  [3] Both");
  const answer = await prompt("Choose [1-3]: ");
  if (answer === "2") return "global";
  if (answer === "3") return "both";
  return "project";
}

function buildSkillManifestEntries(contentDir, skillName, destDir, agent) {
  const entries = [];
  const srcDir = join(contentDir, "skills", skillName);

  function walkSrc(currentSrc, currentDest) {
    for (const entry of readdirSync(currentSrc, { withFileTypes: true })) {
      const srcPath = join(currentSrc, entry.name);
      const destPath = join(currentDest, entry.name);
      if (entry.isDirectory()) {
        walkSrc(srcPath, destPath);
      } else {
        entries.push({
          src: join("content/skills", skillName, srcPath.slice(srcDir.length + 1)),
          dest: destPath,
          hash: hashFile(destPath),
          agent,
          type: "skill",
        });
      }
    }
  }

  walkSrc(srcDir, destDir);
  return entries;
}

function buildFileManifestEntry(src, dest, agent, type) {
  return {
    src,
    dest,
    hash: hashFile(dest),
    agent,
    type,
  };
}

function formatArtifactSummary(artifacts) {
  const parts = [];
  if (artifacts.skills.length) parts.push(`skills: ${artifacts.skills.join(", ")}`);
  if (artifacts.mdRules.length) parts.push(`rules: ${artifacts.mdRules.join(", ")}`);
  if (artifacts.mdcRules.length) parts.push(`mdc: ${artifacts.mdcRules.join(", ")}`);
  if (artifacts.prompts.length) parts.push(`prompts: ${artifacts.prompts.join(", ")}`);
  return parts.length ? parts.join("; ") : "(none)";
}

async function applyCopy({
  src,
  dest,
  isDirectory,
  isRulesFile,
  manifest,
  flags,
  backupRoot,
  dryRun,
  scopeChoice,
}) {
  const state = isDirectory
    ? getDirConflictState(dest, manifest)
    : getFileConflictState(dest, manifest, { isRulesFile });

  if (isRulesFile && state === "missing" && !dryRun) {
    console.log(`  + Creating ${basename(dest)}`);
  }

  const decision = await decideAction(state, dest, flags, { allowMerge: isRulesFile });

  if (decision.action === "skip") {
    if (dryRun && decision.warn) {
      console.log(`  → ${src} → ${dest} (would skip: ${state})`);
      return { copied: true, skipped: false, dryRun: true };
    }
    if (decision.warn) conflictWarning(dest, state);
    return { copied: false, skipped: true };
  }

  const label = dryRun ? "→" : "✓";
  if (dryRun) {
    const verb =
      state === "missing" && isRulesFile
        ? `(create ${basename(dest)})`
        : decision.action === "merge-prepend"
          ? "(merge/prepend)"
          : "";
    console.log(`  ${label} ${src} → ${dest}${verb ? ` ${verb}` : ""}`);
    return { copied: true, skipped: false, dryRun: true };
  }

  if (decision.action === "backup-and-copy" || decision.action === "merge-prepend") {
    const backupLabel = scopeChoice ? `${scopeChoice}-${basename(dest)}` : basename(dest);
    const backupPath = backupFile(dest, backupRoot, { label: backupLabel });
    if (backupPath) console.log(`  ↳ backup ${backupPath}`);
  }

  if (decision.action === "merge-prepend") {
    const toolkitContent = readFileSync(src, "utf8");
    writeMergedRules(dest, mergeRulesFile(dest, toolkitContent));
    console.log(`  ${label} ${dest} (merge/prepend)`);
    return { copied: true, skipped: false };
  }

  copyArtifact(src, dest);
  console.log(`  ${label} ${dest}`);
  return { copied: true, skipped: false };
}

export async function install(flags = {}) {
  const dryRun = Boolean(flags["dry-run"]);
  const target = flags.target ? resolve(process.cwd(), flags.target) : process.cwd();
  const contentDir = join(getPackageRoot(), "content");
  const stack = detectStack(target);
  const existingManifest = readManifest(target);
  const backupRoot = join(target, ".ai-toolkit", "backups", String(Date.now()));
  const artifacts = resolveArtifacts(flags, contentDir);

  console.log(`🔍 Stack: ${stack}`);
  if (dryRun) console.log("🏃 Dry run — no files will be written\n");

  const agents = await selectAgents(target, flags);
  const scope = await selectScope(flags);

  console.log(`\n📦 Artifacts: ${formatArtifactSummary(artifacts)}`);
  console.log(`🎯 Agents: ${agents.map(getAgentName).join(", ")}`);
  console.log(`📁 Scope: ${scope}`);

  if (!flags.yes && !dryRun) {
    const ok = await confirm("\nContinue?", true);
    if (!ok) {
      console.log("Install cancelled.");
      closePrompts();
      return;
    }
  }

  let manifestFiles = [...(existingManifest?.files ?? [])];
  let copiedCount = 0;
  const installedAt = existingManifest?.installedAt ?? new Date().toISOString();

  const flushManifest = () => {
    writeManifest(target, {
      version: pkg.version,
      installedAt,
      agents: mergeAgents(existingManifest?.agents, agents),
      files: manifestFiles,
    });
  };

  for (const agent of agents) {
    const rulesFile = getRulesSourceFile(agent);
    const promptType = getPromptArtifactType(agent);

    for (const scopeChoice of scopesForChoice(scope)) {
      const skillsDestRoot = resolveTarget(agent, scopeChoice, "skills", target);

      for (const skillName of artifacts.skills) {
        const src = join(contentDir, "skills", skillName);
        const dest = join(skillsDestRoot, skillName);
        const result = await applyCopy({
          src,
          dest,
          isDirectory: true,
          manifest: existingManifest,
          flags,
          backupRoot,
          dryRun,
          scopeChoice,
        });

        if (!result.copied) continue;

        copiedCount += 1;
        if (dryRun) continue;

        for (const entry of buildSkillManifestEntries(contentDir, skillName, dest, agent)) {
          manifestFiles = upsertFileEntry(manifestFiles, entry);
        }
        flushManifest();
      }

      if (artifacts.mdRules.includes(rulesFile)) {
        const rulesSrc = join(contentDir, "rules", rulesFile);
        const rulesDest = resolveTarget(agent, scopeChoice, "rules", target);
        if (existsSync(rulesSrc)) {
          const result = await applyCopy({
            src: rulesSrc,
            dest: rulesDest,
            isDirectory: false,
            isRulesFile: true,
            manifest: existingManifest,
            flags,
            backupRoot,
            dryRun,
            scopeChoice,
          });

          if (result.copied) {
            copiedCount += 1;
            if (!dryRun) {
              manifestFiles = upsertFileEntry(
                manifestFiles,
                buildFileManifestEntry(
                  join("content/rules", rulesFile),
                  rulesDest,
                  agent,
                  "rule",
                ),
              );
              flushManifest();
            }
          }
        }
      }

      if (agent === "cursor") {
        for (const mdcName of artifacts.mdcRules) {
          const src = join(contentDir, "rules", "cursor", `${mdcName}.mdc`);
          const rulesDir = resolveTarget(agent, scopeChoice, "rules_dir", target);
          const dest = join(rulesDir, `${mdcName}.mdc`);
          if (!existsSync(src)) continue;

          const result = await applyCopy({
            src,
            dest,
            isDirectory: false,
            manifest: existingManifest,
            flags,
            backupRoot,
            dryRun,
            scopeChoice,
          });

          if (result.copied) {
            copiedCount += 1;
            if (!dryRun) {
              manifestFiles = upsertFileEntry(
                manifestFiles,
                buildFileManifestEntry(
                  join("content/rules/cursor", `${mdcName}.mdc`),
                  dest,
                  agent,
                  "mdc",
                ),
              );
              flushManifest();
            }
          }
        }
      }

      if (promptType) {
        for (const promptName of artifacts.prompts) {
          const src = join(contentDir, "prompts", `${promptName}.md`);
          const promptDir = resolveTarget(agent, scopeChoice, promptType, target);
          const dest = join(promptDir, `${promptName}.md`);
          if (!existsSync(src)) continue;

          const result = await applyCopy({
            src,
            dest,
            isDirectory: false,
            manifest: existingManifest,
            flags,
            backupRoot,
            dryRun,
            scopeChoice,
          });

          if (result.copied) {
            copiedCount += 1;
            if (!dryRun) {
              manifestFiles = upsertFileEntry(
                manifestFiles,
                buildFileManifestEntry(
                  join("content/prompts", `${promptName}.md`),
                  dest,
                  agent,
                  "prompt",
                ),
              );
              flushManifest();
            }
          }
        }
      }
    }
  }

  if (dryRun) {
    console.log(`\n🏃 Dry run complete. ${copiedCount} copy action(s) planned.`);
    closePrompts();
    return;
  }

  closePrompts();
  console.log(`\n✅ Done. Copied ${copiedCount} artifact(s).`);
}
