interface ClientRecord {
  count: number;
  resetAt: number;
}

const clientRateLimitMap = new Map<string, ClientRecord>();

export const SANDBOX_RATE_LIMIT_MAX = 10;
export const SANDBOX_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

export function resetSandboxRateLimits() {
  clientRateLimitMap.clear();
}

export function checkSandboxRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const existing = clientRateLimitMap.get(ip);

  // Periodically clean up stale records to prevent memory growth
  if (clientRateLimitMap.size > 1000) {
    for (const [key, val] of clientRateLimitMap.entries()) {
      if (now > val.resetAt) {
        clientRateLimitMap.delete(key);
      }
    }
  }

  if (!existing || now > existing.resetAt) {
    clientRateLimitMap.set(ip, {
      count: 1,
      resetAt: now + SANDBOX_RATE_LIMIT_WINDOW_MS
    });
    return { allowed: true, retryAfter: 0 };
  }

  if (existing.count >= SANDBOX_RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  existing.count += 1;
  return { allowed: true, retryAfter: 0 };
}
