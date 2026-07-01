import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { getPackageRoot } from "./agents.js";
import { scanBundledCatalog } from "./catalog.js";
import { hashFile } from "./copy.js";
import { readManifest } from "./manifest.js";

const pkg = JSON.parse(
  readFileSync(join(getPackageRoot(), "package.json"), "utf8"),
);

function catalogSrcPath(type, name) {
  if (type === "skills") return `content/skills/${name}`;
  if (type === "rules") return `content/rules/${name}`;
  if (type === "prompts") return `content/prompts/${name}.md`;
  return null;
}

function installedStatus(manifest, type, name) {
  if (!manifest) return null;
  const prefix = catalogSrcPath(type, name);
  const entries = manifest.files.filter((f) => f.src === prefix || f.src.startsWith(`${prefix}/`));
  if (entries.length === 0) return false;

  for (const entry of entries) {
    if (!existsSync(entry.dest)) return false;
    if (hashFile(entry.dest) !== entry.hash) return false;
  }
  return true;
}

function printSection(title, items, manifest, type) {
  if (items.length === 0) return;
  console.log(`\n${title}:`);
  for (const name of items) {
    if (manifest) {
      const status = installedStatus(manifest, type, name);
      const mark = status === true ? "✓" : status === false ? "✗" : " ";
      console.log(`  [${mark}] ${name}`);
    } else {
      console.log(`  - ${name}`);
    }
  }
}

export function list(flags = {}) {
  const target = flags.target ? resolve(process.cwd(), flags.target) : process.cwd();
  const contentDir = join(getPackageRoot(), "content");
  const catalog = scanBundledCatalog(contentDir);
  const showInstalled = Boolean(flags.installed);
  const manifest = showInstalled ? readManifest(target) : null;

  console.log(`ai-toolkit v${pkg.version} — bundled catalog`);
  if (showInstalled) {
    console.log(`Target: ${target}`);
    if (!manifest) console.log("(no manifest — nothing installed)");
  }

  printSection("Skills", catalog.skills, manifest, "skills");
  printSection("Rules", catalog.rules, manifest, "rules");
  printSection("Prompts", catalog.prompts, manifest, "prompts");

  if (catalog.skills.length + catalog.rules.length + catalog.prompts.length === 0) {
    console.log("\n(no bundled artifacts)");
  }
}
