const getClientApiBaseUrl = () =>
  process.env.NEXT_PUBLIC_AGENTREADY_API_URL || "http://localhost:3001";

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
  const base = getClientApiBaseUrl();
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "include",
  });
  return handleResponse(res);
}

export async function register(email: string, password: string, organizationName: string) {
  const base = getClientApiBaseUrl();
  const res = await fetch(`${base}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, organizationName }),
    credentials: "include",
  });
  return handleResponse(res);
}

export async function getMe() {
  const base = getClientApiBaseUrl();
  const res = await fetch(`${base}/api/v1/auth/me`, {
    method: "GET",
    credentials: "include",
  });
  return handleResponse(res);
}
