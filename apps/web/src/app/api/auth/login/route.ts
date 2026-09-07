import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const apiBaseUrl = process.env.AGENTREADY_API_URL || "http://localhost:3001";

    const res = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    const setCookieHeader = res.headers.get("set-cookie");
    const response = NextResponse.json(data, { status: 200 });

    if (setCookieHeader) {
      // Forward the Set-Cookie header directly so the browser receives it on origin localhost:3000
      response.headers.set("set-cookie", setCookieHeader);

      // Also parse token to ensure cookieStore has it if accessed within Next.js
      const match = setCookieHeader.match(/agentready_session=([^;]+)/);
      if (match && match[1]) {
        const cookieStore = await cookies();
        cookieStore.set("agentready_session", match[1], {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7,
          secure: process.env.NODE_ENV === "production",
        });
      }
    }

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: err?.message || "Failed to reach API server" } },
      { status: 500 }
    );
  }
}
