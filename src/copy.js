import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import os from "node:os";

export function expandTilde(path) {
  if (path.startsWith("~/")) {
    return `${os.homedir()}${path.slice(1)}`;
  }
  return path;
}

export function hashFile(path) {
  const data = readFileSync(path);
  const digest = createHash("sha256").update(data).digest("hex");
  return `sha256:${digest}`;
}

export function copyArtifact(src, dest) {
  if (!existsSync(src)) {
    throw new Error(`Source not found: ${src}`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, force: true });
}

export function backupFile(dest, backupDir, { label } = {}) {
  if (!existsSync(dest)) return null;

  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, label ?? basename(dest));
  cpSync(dest, backupPath, { recursive: true, force: true });
  return backupPath;
}
