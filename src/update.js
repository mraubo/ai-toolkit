import { homedir } from "node:os";
import { resolve } from "node:path";

import { install } from "./install.js";
import { readManifest, writeManifest } from "./manifest.js";

function inferScope(manifest, target) {
  const home = homedir();
  let hasProject = false;
  let hasGlobal = false;

  for (const entry of manifest.files ?? []) {
    const dest = entry.dest;
    if (dest.startsWith(target)) {
      hasProject = true;
    } else if (dest.startsWith(home)) {
      hasGlobal = true;
    }
  }

  if (hasProject && hasGlobal) return "both";
  if (hasGlobal) return "global";
  return "project";
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

  await install({
    ...flags,
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
