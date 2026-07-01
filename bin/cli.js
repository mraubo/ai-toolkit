#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "../src/args.js";
import { doctor } from "../src/doctor.js";
import { install } from "../src/install.js";
import { list } from "../src/list.js";
import { uninstall } from "../src/uninstall.js";
import { update } from "../src/update.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

function printUsage() {
  console.log(`ai-toolkit v${pkg.version}

Usage:
  ai-toolkit install [options]   Install AI artifacts into a project
  ai-toolkit uninstall [options] Remove manifest-tracked artifacts
  ai-toolkit list [options]      Show bundled artifact catalog
  ai-toolkit doctor [options]    Check Node, auth, manifest, and file drift
  ai-toolkit update [options]    Re-sync installed artifacts from this package

Options:
  --agent <claude,cursor,codex|all>  Target agent(s)
  --scope <project|global|both>  Install scope
  --target <path>                Target project directory
  --installed                    (list) Show install status from manifest
  --yes, -y                      Skip interactive prompts
  --force                        Overwrite existing files
  --dry-run                      Preview copies without writing

Package: ${pkg.name}
`);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmd = positional[0];

  if (!cmd || cmd === "--help" || cmd === "-h") {
    printUsage();
    process.exit(0);
  }

  if (cmd === "install") {
    await install(flags);
    return;
  }

  if (cmd === "uninstall") {
    await uninstall(flags);
    return;
  }

  if (cmd === "list") {
    list(flags);
    return;
  }

  if (cmd === "doctor") {
    doctor(flags);
    return;
  }

  if (cmd === "update") {
    await update(flags);
    return;
  }

  console.error(`ai-toolkit: unknown command '${cmd}'`);
  printUsage();
  process.exit(1);
}

main().catch((error) => {
  console.error(`ai-toolkit: ${error.message}`);
  process.exit(1);
});
