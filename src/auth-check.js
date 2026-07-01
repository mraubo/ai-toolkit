import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SCOPE = "@mraubo";
const REGISTRY = "https://npm.pkg.github.com";
const NPMRC = join(homedir(), ".npmrc");

export function checkAuth() {
  if (!existsSync(NPMRC)) {
    return {
      ok: false,
      registry: REGISTRY,
      message:
        "Missing ~/.npmrc. Run scripts/setup.sh or configure @mraubo registry and auth token.",
    };
  }

  const content = readFileSync(NPMRC, "utf8");
  const hasScope = content.includes(`${SCOPE}:registry=`);
  const hasToken = content.includes("//npm.pkg.github.com/:_authToken=");

  if (!hasScope || !hasToken) {
    return {
      ok: false,
      registry: REGISTRY,
      message:
        "~/.npmrc missing @mraubo registry or token. Run: gh auth refresh -h github.com -s read:packages",
    };
  }

  const gh = spawnSync("gh", ["auth", "status"], { encoding: "utf8" });
  if (gh.error?.code === "ENOENT") {
    return {
      ok: true,
      registry: REGISTRY,
      message: "~/.npmrc configured (gh not installed — optional)",
    };
  }

  if (gh.status !== 0) {
    return {
      ok: true,
      registry: REGISTRY,
      message: "~/.npmrc configured (gh not logged in — optional)",
    };
  }

  const ghOutput = `${gh.stdout}${gh.stderr}`;
  if (!ghOutput.includes("read:packages")) {
    return {
      ok: false,
      registry: REGISTRY,
      message:
        "gh token missing read:packages scope. Run: gh auth refresh -h github.com -s read:packages",
    };
  }

  return {
    ok: true,
    registry: REGISTRY,
    message: "GitHub Packages auth configured",
  };
}
