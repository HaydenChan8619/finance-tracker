import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const rules = await prisma.categoryRule.findMany({
      include: { category: true },
      orderBy: [{ priority: "desc" }, { pattern: "asc" }],
    });
    return jsonOk(
      rules.map((rule) => ({
        id: rule.id,
        pattern: rule.pattern,
        priority: rule.priority,
        category: rule.category,
        createdAt: rule.createdAt.toISOString(),
      })),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
