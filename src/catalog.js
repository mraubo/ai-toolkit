import { listBundledArtifacts } from "./artifacts.js";

export function scanBundledCatalog(contentDir) {
  const { skills, rules, prompts, mdcRules } = listBundledArtifacts(contentDir);
  return {
    skills,
    rules: [...rules, ...mdcRules.map((name) => `cursor/${name}.mdc`)],
    prompts,
  };
}
