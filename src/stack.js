import { existsSync } from "node:fs";
import { join } from "node:path";

const MARKERS = [
  { label: "php", files: ["composer.json"] },
  { label: "node", files: ["package.json"] },
  { label: "elixir", files: ["mix.exs"] },
  { label: "python", files: ["pyproject.toml", "requirements.txt", "setup.py"] },
  { label: "ruby", files: ["Gemfile"] },
  { label: "go", files: ["go.mod"] },
  { label: "rust", files: ["Cargo.toml"] },
];

export function detectStack(cwd) {
  for (const { label, files } of MARKERS) {
    if (files.some((file) => existsSync(join(cwd, file)))) {
      return label;
    }
  }
  return "unknown";
}
