import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

let rl;

function getInterface() {
  if (!rl) {
    rl = readline.createInterface({ input, output });
  }
  return rl;
}

export async function prompt(question) {
  return (await getInterface().question(question)).trim();
}

export async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await prompt(`${question} ${hint}: `);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

export function closePrompts() {
  if (rl) {
    rl.close();
    rl = undefined;
  }
}
