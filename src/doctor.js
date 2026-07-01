import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { getPackageRoot } from "./agents.js";
import { checkAuth } from "./auth-check.js";
import { hashFile } from "./copy.js";
import { readManifest } from "./manifest.js";

const pkg = JSON.parse(
  readFileSync(join(getPackageRoot(), "package.json"), "utf8"),
);

function checkNode() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (major < 20) {
    return {
      level: "error",
      message: `Node.js 20+ required (found ${process.versions.node})`,
    };
  }
  return { level: "ok", message: `Node.js ${process.versions.node}` };
}

function checkManifestVersion(manifest) {
  if (!manifest) {
    return { level: "warn", message: "No .ai-toolkit/manifest.json in target" };
  }
  if (manifest.version !== pkg.version) {
    return {
      level: "warn",
      message: `Manifest version ${manifest.version} ≠ package ${pkg.version} — run update`,
    };
  }
  return { level: "ok", message: `Manifest version ${manifest.version}` };
}

function checkFileDrift(manifest) {
  const issues = [];
  if (!manifest?.files) return issues;

  for (const entry of manifest.files) {
    if (!existsSync(entry.dest)) {
      issues.push({
        level: "error",
        message: `Missing file: ${entry.dest}`,
      });
      continue;
    }
    const current = hashFile(entry.dest);
    if (current !== entry.hash) {
      issues.push({
        level: "error",
        message: `Hash drift: ${entry.dest}`,
      });
    }
  }
  return issues;
}

function printResult({ level, message }) {
  const icon = level === "ok" ? "✅" : level === "warn" ? "⚠️" : "❌";
  console.log(`${icon} ${message}`);
}

export function doctor(flags = {}) {
  const target = flags.target ? resolve(process.cwd(), flags.target) : process.cwd();
  const manifest = readManifest(target);
  let hasError = false;

  console.log(`ai-toolkit doctor v${pkg.version}`);
  console.log(`Target: ${target}`);
  if (target.startsWith(homedir())) {
    console.log("(global/home path)");
  }
  console.log();

  const node = checkNode();
  printResult(node);
  if (node.level === "error") hasError = true;

  const auth = checkAuth();
  printResult({
    level: auth.ok ? "ok" : "error",
    message: auth.message,
  });
  if (!auth.ok) hasError = true;

  const version = checkManifestVersion(manifest);
  printResult(version);
  if (version.level === "error") hasError = true;

  const driftIssues = checkFileDrift(manifest);
  if (driftIssues.length === 0 && manifest) {
    printResult({ level: "ok", message: "All manifest files match recorded hashes" });
  } else {
    for (const issue of driftIssues) {
      printResult(issue);
      if (issue.level === "error") hasError = true;
    }
  }

  console.log();
  if (hasError) {
    console.log("Doctor found issues that need attention.");
    process.exit(1);
  }
  console.log("All checks passed.");
}
