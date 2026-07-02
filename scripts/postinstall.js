#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.AI_TOOLKIT_AUTO_INSTALL !== "1") {
  process.exit(0);
}

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.env.INIT_CWD || process.cwd();
const cli = join(packageRoot, "bin/cli.js");

try {
  const result = spawnSync(
    process.execPath,
    [cli, "install", "--yes", "--agent", "all", "--scope", "project", "--target", target],
    { stdio: "inherit", cwd: target },
  );

  if (result.status !== 0) {
    console.warn(
      `ai-toolkit postinstall: install exited with status ${result.status ?? "unknown"}`,
    );
  }
} catch (error) {
  console.warn(`ai-toolkit postinstall: ${error.message}`);
}

process.exit(0);
