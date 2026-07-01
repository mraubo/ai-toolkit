import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function scanBundledCatalog(contentDir) {
  const skills = [];
  const skillsRoot = join(contentDir, "skills");
  if (existsSync(skillsRoot)) {
    for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) skills.push(entry.name);
    }
  }

  const rules = [];
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
          rules.push(`cursor/${entry.name}`);
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

  return { skills, rules, prompts };
}
