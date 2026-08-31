import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { categoryInputSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireAdmin(request);
    const { id } = await context.params;
    const input = categoryInputSchema.partial().parse(await readJson(request));
    const category = await prisma.category.update({ where: { id }, data: input });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "update",
        entityType: "category",
        entityId: id,
        details: JSON.stringify(input),
      },
    });
    return jsonOk(category);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return jsonError("Category not found.", 404);
    }
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return jsonError("A category with that name already exists.", 409);
    }
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requireAdmin(request);
    const { id } = await context.params;
    await prisma.category.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "delete",
        entityType: "category",
        entityId: id,
      },
    });
    return jsonOk({ deleted: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return jsonError("Category not found.", 404);
    }
    return handleRouteError(error);
  }
}
