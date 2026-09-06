import { getApiKey } from "../sandboxAuth";

export const getApiBaseUrl = (): string => {
  return process.env.AGENTREADY_API_URL || process.env.NEXT_PUBLIC_AGENTREADY_API_URL || "http://localhost:3001";
};

// Generic fetch wrapper with support for session cookie or machine Bearer key auth
export const fetchFromBackend = async (
  path: string,
  options: RequestInit,
  request: Request,
  authType: "session" | "bearer"
): Promise<any> => {
  const apiBaseUrl = getApiBaseUrl();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  } as Record<string, string>;

  if (authType === "session") {
    const cookie = request.headers.get("cookie");
    if (cookie) {
      headers["cookie"] = cookie;
    }
  } else if (authType === "bearer") {
    headers["Authorization"] = `Bearer ${getApiKey()}`;
  }

  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorMsg = `API returned HTTP ${res.status}: ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.error?.message) {
        errorMsg = errorBody.error.message;
      }
    } catch {
      // ignore json parse error
    }
    const err = new Error(errorMsg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  return res.json();
};
