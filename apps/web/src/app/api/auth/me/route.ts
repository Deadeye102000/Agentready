import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const apiBaseUrl = process.env.AGENTREADY_API_URL || "http://localhost:3001";
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();

    const res = await fetch(`${apiBaseUrl}/api/v1/auth/me`, {
      method: "GET",
      headers: {
        Cookie: cookieHeader,
      },
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: err?.message || "Failed to reach API server" } },
      { status: 500 }
    );
  }
}
