import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

import { hashFile } from "./copy.js";
import { findEntriesUnder, findEntry } from "./manifest.js";
import { prompt } from "./prompt.js";

export function getFileConflictState(dest, manifest, { isRulesFile = false } = {}) {
  if (!existsSync(dest)) return "missing";

  if (isRulesFile && readFileSync(dest, "utf8").trim() === "") {
    return "missing";
  }

  const entry = findEntry(manifest, dest);
  if (!entry) return "user-owned";

  const currentHash = hashFile(dest);
  if (currentHash !== entry.hash) return "modified";
  return "owned-unchanged";
}

export function getDirConflictState(destDir, manifest) {
  if (!existsSync(destDir)) return "missing";

  const entries = findEntriesUnder(manifest, destDir);
  if (entries.length === 0) return "user-owned";

  for (const entry of entries) {
    if (!existsSync(entry.dest)) continue;
    if (hashFile(entry.dest) !== entry.hash) return "modified";
  }
  return "owned-unchanged";
}

export async function decideAction(state, dest, flags, { allowMerge = false } = {}) {
  if (state === "missing" || state === "owned-unchanged") {
    return { action: "copy" };
  }

  if (flags.force) {
    return { action: "copy", reason: "force" };
  }

  if (flags["dry-run"]) {
    return { action: "skip", reason: state, warn: true };
  }

  if (flags.yes) {
    return { action: "skip", reason: state, warn: true };
  }

  console.log(`\nConflict: ${dest}`);
  if (allowMerge) {
    console.log("  [s] Skip  [b] Backup and overwrite  [o] Overwrite  [m] Merge/prepend");
    const answer = (await prompt("Choose [s/b/o/m]: ")).toLowerCase();
    if (answer.startsWith("m")) return { action: "merge-prepend" };
    if (answer.startsWith("b")) return { action: "backup-and-copy" };
    if (answer.startsWith("o")) return { action: "copy" };
    return { action: "skip", reason: "user-skip" };
  }

  console.log("  [s] Skip  [b] Backup and overwrite  [o] Overwrite");
  const answer = (await prompt("Choose [s/b/o]: ")).toLowerCase();
  if (answer.startsWith("b")) return { action: "backup-and-copy" };
  if (answer.startsWith("o")) return { action: "copy" };
  return { action: "skip", reason: "user-skip" };
}

export function conflictWarning(dest, state) {
  const name = basename(dest);
  if (state === "modified") {
    console.warn(`  ⚠ Skipping ${name} (modified since last install — use --force or run interactively)`);
    return;
  }
  console.warn(
    `  ⚠ Skipping ${name} (already exists — use --force, or run without --yes to merge/overwrite)`,
  );
}
