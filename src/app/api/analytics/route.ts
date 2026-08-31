import { requireAdmin } from "@/lib/auth";
import { getAnalytics } from "@/lib/analytics";
import { handleRouteError, jsonOk } from "@/lib/api";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return jsonOk(await getAnalytics());
  } catch (error) {
    return handleRouteError(error);
  }
}
