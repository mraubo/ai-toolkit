import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { readManifest } from "./manifest.js";

function removePath(path) {
  if (!existsSync(path)) return;
  rmSync(path, { recursive: true, force: true });
}

function removeEmptyDir(dir) {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir);
  if (entries.length === 0) rmSync(dir, { recursive: true, force: true });
}

function removeEmptyParents(path, stopAt) {
  let dir = dirname(path);
  while (dir.length >= stopAt.length && dir.startsWith(stopAt)) {
    if (!existsSync(dir)) break;
    if (readdirSync(dir).length > 0) break;
    rmSync(dir, { recursive: true, force: true });
    dir = dirname(dir);
  }
}

export async function uninstall(flags = {}) {
  const target = flags.target ? resolve(process.cwd(), flags.target) : process.cwd();
  const manifest = readManifest(target);

  if (!manifest) {
    console.log("No manifest found — nothing to uninstall.");
    return;
  }

  for (const entry of manifest.files ?? []) {
    removePath(entry.dest);
    removeEmptyParents(entry.dest, target);
  }

  removePath(join(target, ".ai-toolkit", "manifest.json"));
  removeEmptyDir(join(target, ".ai-toolkit"));

  console.log(`✅ Uninstalled ${manifest.files?.length ?? 0} tracked file(s).`);
}
