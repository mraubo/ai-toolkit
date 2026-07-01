import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function prompt(question) {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await prompt(`${question} ${hint}: `);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}
