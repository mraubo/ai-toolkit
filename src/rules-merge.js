import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const PACKAGE_NAME = "@mraubo/ai-toolkit";

export function mergeRulesContent(existing, toolkitContent) {
  const BEGIN = `<!-- BEGIN ${PACKAGE_NAME} -->`;
  const END = `<!-- END ${PACKAGE_NAME} -->`;
  const block = `${BEGIN}\n${toolkitContent.trim()}\n${END}`;

  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);

  if (start !== -1 && end !== -1 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + END.length);
  }

  if (!existing.trim()) return `${block}\n`;

  return `${block}\n\n${existing.trimEnd()}\n`;
}

export function mergeRulesFile(destPath, toolkitContent) {
  const existing = existsSync(destPath) ? readFileSync(destPath, "utf8") : "";
  return mergeRulesContent(existing, toolkitContent);
}

export function writeMergedRules(destPath, content) {
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, content);
}
