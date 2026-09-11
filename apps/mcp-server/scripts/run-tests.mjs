import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const targetDir = process.argv[2] || "test";
const suffix = process.argv[3] || ".test.ts";

const entries = readdirSync(targetDir, { recursive: true });
const files = entries
  .filter((f) => typeof f === "string" && f.endsWith(suffix))
  .map((f) => path.join(targetDir, f));

if (files.length === 0) {
  console.error(`No test files found in ${targetDir} matching *${suffix}`);
  process.exit(1);
}

const result = spawnSync("node", ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "test",
  },
});

process.exit(result.status ?? 1);
