"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export async function toggleFeatureFlag(capability: string, agentId: string | null) {
  const apiBaseUrl = process.env.AGENTREADY_API_URL ?? "http://localhost:3001";
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/feature-flags/toggle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: cookieHeader
      },
      body: JSON.stringify({
        capability,
        agentId: agentId || null
      })
    });
    if (!response.ok) {
      console.error("Failed to toggle feature flag", await response.text());
    }
  } catch (err) {
    console.error("Error toggling feature flag:", err);
  }

  revalidatePath("/feature-flags");
  revalidatePath("/");
}
