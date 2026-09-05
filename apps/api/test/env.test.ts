import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseEnv, DEV_DEFAULT_AUTH_SESSION_SECRET } from "../src/lib/env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("Environment & Production Secret Protection", () => {
  it("fails validation when NODE_ENV=production and AUTH_SESSION_SECRET is unset", () => {
    assert.throws(
      () => {
        parseEnv({
          NODE_ENV: "production"
        });
      },
      (err: any) => {
        assert.match(
          err.message,
          /AUTH_SESSION_SECRET is required in production and must not use the development default/
        );
        return true;
      }
    );
  });

  it("fails validation when NODE_ENV=production and AUTH_SESSION_SECRET uses development default", () => {
    assert.throws(
      () => {
        parseEnv({
          NODE_ENV: "production",
          AUTH_SESSION_SECRET: DEV_DEFAULT_AUTH_SESSION_SECRET
        });
      },
      (err: any) => {
        assert.match(
          err.message,
          /AUTH_SESSION_SECRET is required in production and must not use the development default/
        );
        return true;
      }
    );
  });

  it("allows development-only fallback secret when NODE_ENV=development", () => {
    const devEnv = parseEnv({
      NODE_ENV: "development"
    });
    assert.equal(devEnv.AUTH_SESSION_SECRET, DEV_DEFAULT_AUTH_SESSION_SECRET);
    assert.equal(devEnv.NODE_ENV, "development");
  });

  it("allows production startup when a strong custom secret is provided", () => {
    const prodSecret = "super-secure-production-secret-at-least-32-chars-long";
    const prodEnv = parseEnv({
      NODE_ENV: "production",
      AUTH_SESSION_SECRET: prodSecret
    });
    assert.equal(prodEnv.AUTH_SESSION_SECRET, prodSecret);
    assert.equal(prodEnv.NODE_ENV, "production");
  });

  it("confirms API server startup process exits with failure when NODE_ENV=production and secret is unset", () => {
    const entrypoint = resolve(__dirname, "../src/index.ts");
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", entrypoint],
      {
        env: {
          ...process.env,
          NODE_ENV: "production",
          AUTH_SESSION_SECRET: ""
        },
        encoding: "utf-8",
        timeout: 5000
      }
    );

    assert.notEqual(result.status, 0, "Server startup process should exit with non-zero code");
    const combinedOutput = (result.stdout || "") + (result.stderr || "");
    assert.match(
      combinedOutput,
      /AUTH_SESSION_SECRET is required in production and must not use the development default/
    );
  });
});
