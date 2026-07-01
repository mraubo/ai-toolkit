#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

function printUsage() {
  console.log(`ai-toolkit v${pkg.version}

Usage:
  ai-toolkit              Show this help
  ai-toolkit install      Install AI artifacts (coming in v0.1.0)
  ai-toolkit uninstall    Remove installed artifacts (coming in v0.1.0)

Package: ${pkg.name}
`);
}

const [cmd] = process.argv.slice(2);

if (!cmd || cmd === "--help" || cmd === "-h") {
  printUsage();
  process.exit(0);
}

if (cmd === "install" || cmd === "uninstall") {
  console.error(`ai-toolkit: '${cmd}' is not implemented yet (v${pkg.version} stub)`);
  process.exit(1);
}

console.error(`ai-toolkit: unknown command '${cmd}'`);
printUsage();
process.exit(1);
