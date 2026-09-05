import crypto from "crypto";

/**
 * Deterministically canonicalizes JSON by recursively sorting object keys lexicographically.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs: string[] = [];

  for (const k of sortedKeys) {
    if (obj[k] !== undefined) {
      pairs.push(`${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
    }
  }

  return `{${pairs.join(",")}}`;
}

/**
 * Computes a SHA-256 hash of canonicalized JSON arguments.
 */
export function computeArgumentsHash(args: unknown): string {
  const canonical = canonicalizeJson(args);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

const SECRET_KEY_PATTERN = /(?:password|secret|token|api_?key|auth|bearer|private_?key|credential)/i;
const SECRET_VALUE_PATTERN = /^(?:ar_(?:live|test)_[a-zA-Z0-9_-]+|Bearer\s+[a-zA-Z0-9._-]+)/i;
const MAX_STRING_LENGTH = 4096;
const MAX_RECURSION_DEPTH = 10;

/**
 * Redacts known sensitive keys and values, and truncates oversized strings.
 */
export function redactAndTruncate(value: unknown, depth = 0): unknown {
  if (depth > MAX_RECURSION_DEPTH) {
    return "[MAX_DEPTH_EXCEEDED]";
  }

  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERN.test(value)) {
      return "[REDACTED]";
    }
    if (value.length > MAX_STRING_LENGTH) {
      return `${value.slice(0, MAX_STRING_LENGTH)}... [TRUNCATED: len=${value.length}]`;
    }
    return value;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactAndTruncate(item, depth + 1));
  }

  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEY_PATTERN.test(k)) {
      result[k] = "[REDACTED]";
    } else {
      result[k] = redactAndTruncate(v, depth + 1);
    }
  }

  return result;
}
