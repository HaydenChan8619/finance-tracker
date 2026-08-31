import { NextResponse } from "next/server";
import { assertAuthConfiguration, checkAdminPassword, createAdminSession, ensureAdminUser, setSessionCookie } from "@/lib/auth";
import { handleRouteError, jsonError, readJson } from "@/lib/api";
import { checkLoginRateLimit, clearLoginRateLimit, loginRateLimitKey } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertAuthConfiguration();
    const input = loginSchema.parse(await readJson(request));
    const email = input.email.toLocaleLowerCase("en-US");
    const rateLimitKey = loginRateLimitKey(request, email);
    const rateLimit = checkLoginRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      const response = jsonError("Too many sign-in attempts. Try again later.", 429);
      response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
      return response;
    }
    const isValid = await checkAdminPassword(email, input.password);

    if (!isValid) {
      return jsonError("Invalid email or password.", 401);
    }

    clearLoginRateLimit(rateLimitKey);
    const user = await ensureAdminUser(email, input.password);
    const session = await createAdminSession(user.id);
    const response = NextResponse.json(
      {
        authenticated: true,
        user: { email: user.email },
        expiresAt: session.expiresAt.toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    setSessionCookie(response, session.token);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
