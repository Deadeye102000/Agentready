const getAuthApiBaseUrl = () => {
  if (typeof window !== "undefined") {
    return "";
  }
  return process.env.AGENTREADY_API_URL || "http://localhost:3000";
};

async function handleResponse(res: Response) {
  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error?.message) {
        errorMessage = body.error.message;
      }
    } catch {
      // Ignore json parse error
    }
    throw new Error(errorMessage);
  }
  return res.json().catch(() => ({}));
}

export async function login(email: string, password: string) {
  const base = getAuthApiBaseUrl();
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "same-origin",
  });
  return handleResponse(res);
}

export async function register(email: string, password: string, organizationName: string) {
  const base = getAuthApiBaseUrl();
  const res = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, organizationName }),
    credentials: "same-origin",
  });
  return handleResponse(res);
}

export async function logout() {
  const base = getAuthApiBaseUrl();
  const res = await fetch(`${base}/api/auth/logout`, {
    method: "POST",
    credentials: "same-origin",
  });
  return handleResponse(res);
}

export async function getMe() {
  const base = getAuthApiBaseUrl();
  const res = await fetch(`${base}/api/auth/me`, {
    method: "GET",
    credentials: "same-origin",
  });
  return handleResponse(res);
}
