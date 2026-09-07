import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const apiBaseUrl = process.env.AGENTREADY_API_URL || "http://localhost:3001";
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();

    const res = await fetch(`${apiBaseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
    });

    const data = await res.json().catch(() => ({ ok: true }));

    const response = NextResponse.json(data, { status: res.ok ? 200 : res.status });

    // Clear the cookie on localhost:3000
    cookieStore.delete("agentready_session");
    response.cookies.delete("agentready_session");

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: err?.message || "Failed to reach API server" } },
      { status: 500 }
    );
  }
}
