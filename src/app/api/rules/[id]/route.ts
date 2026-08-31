import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requireAdmin(request);
    const { id } = await context.params;
    await prisma.categoryRule.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "delete",
        entityType: "category_rule",
        entityId: id,
      },
    });
    return jsonOk({ deleted: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return jsonError("Rule not found.", 404);
    }
    return handleRouteError(error);
  }
}
