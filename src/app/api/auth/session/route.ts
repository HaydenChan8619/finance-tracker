import { getAdminSession } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const session = await getAdminSession(request);
    return jsonOk({
      authenticated: Boolean(session),
      user: session ? { email: session.user.email } : null,
      expiresAt: session?.expiresAt.toISOString() ?? null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
