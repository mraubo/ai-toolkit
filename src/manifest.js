import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MANIFEST_DIR = ".ai-toolkit";
const MANIFEST_FILE = "manifest.json";

function normalizePath(path) {
  return resolve(path);
}

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
  const finalPath = manifestPath(cwd);
  const tmpPath = join(dir, `${MANIFEST_FILE}.tmp`);
  writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmpPath, finalPath);
}

export function findEntry(manifest, dest) {
  if (!manifest?.files) return undefined;
  const normalized = normalizePath(dest);
  return manifest.files.find((entry) => normalizePath(entry.dest) === normalized);
}

export function findEntriesUnder(manifest, dirPath) {
  if (!manifest?.files) return [];
  const prefix = `${normalizePath(dirPath)}/`;
  return manifest.files.filter(
    (entry) => {
      const entryPath = normalizePath(entry.dest);
      return entryPath === normalizePath(dirPath) || entryPath.startsWith(prefix);
    },
  );
}

export function upsertFileEntry(files, entry) {
  const next = [...files];
  const normalized = normalizePath(entry.dest);
  const index = next.findIndex((item) => normalizePath(item.dest) === normalized);
  if (index >= 0) next[index] = entry;
  else next.push(entry);
  return next;
}

export function mergeAgents(existing, added) {
  return [...new Set([...(existing ?? []), ...added])];
}
