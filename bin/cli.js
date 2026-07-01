#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { install } from "../src/install.js";
import { uninstall } from "../src/uninstall.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--yes" || arg === "-y") {
      flags.yes = true;
    } else if (arg === "--force") {
      flags.force = true;
    } else if (arg === "--dry-run") {
      flags["dry-run"] = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

function printUsage() {
  console.log(`ai-toolkit v${pkg.version}

Usage:
  ai-toolkit install [options]   Install AI artifacts into a project
  ai-toolkit uninstall [options] Remove manifest-tracked artifacts

Options:
  --agent <claude,cursor|all>    Target agent(s)
  --scope <project|global|both>  Install scope
  --target <path>                Target project directory
  --yes, -y                      Skip interactive prompts
  --force                        Overwrite existing files (Phase 3)
  --dry-run                      Preview without writing (Phase 3)

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

  console.error(`ai-toolkit: unknown command '${cmd}'`);
  printUsage();
  process.exit(1);
}

main().catch((error) => {
  console.error(`ai-toolkit: ${error.message}`);
  process.exit(1);
});
