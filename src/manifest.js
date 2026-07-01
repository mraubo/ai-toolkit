import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MANIFEST_DIR = ".ai-toolkit";
const MANIFEST_FILE = "manifest.json";

export function manifestPath(cwd) {
  return join(cwd, MANIFEST_DIR, MANIFEST_FILE);
}

export function readManifest(cwd) {
  const path = manifestPath(cwd);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeManifest(cwd, data) {
  const dir = join(cwd, MANIFEST_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(manifestPath(cwd), `${JSON.stringify(data, null, 2)}\n`);
}

export function findEntry(manifest, dest) {
  if (!manifest?.files) return undefined;
  return manifest.files.find((entry) => entry.dest === dest);
}

export function findEntriesUnder(manifest, dirPath) {
  if (!manifest?.files) return [];
  const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
  return manifest.files.filter(
    (entry) => entry.dest === dirPath || entry.dest.startsWith(prefix),
  );
}

export function upsertFileEntry(files, entry) {
  const next = [...files];
  const index = next.findIndex((item) => item.dest === entry.dest);
  if (index >= 0) next[index] = entry;
  else next.push(entry);
  return next;
}

export function mergeAgents(existing, added) {
  return [...new Set([...(existing ?? []), ...added])];
}
