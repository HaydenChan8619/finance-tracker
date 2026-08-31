import { NextResponse } from "next/server";
import { clearAuthCookies, destroyAdminSession } from "@/lib/auth";
import { handleRouteError } from "@/lib/api";

export async function POST(request: Request) {
  try {
    await destroyAdminSession(request);
    const response = NextResponse.json(
      { authenticated: false },
      { headers: { "Cache-Control": "no-store" } },
    );
    clearAuthCookies(response);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
