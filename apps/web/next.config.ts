import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Discover and load monorepo root .env if present
const candidates = [
  path.resolve(__dirname, "../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
];

for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    try {
      if (typeof process.loadEnvFile === "function") {
        process.loadEnvFile(candidate);
      }
    } catch {
      // Ignore if already set or unparseable
    }
    break;
  }
}

const apiBaseUrl = process.env.AGENTREADY_API_URL || "http://localhost:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiBaseUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
