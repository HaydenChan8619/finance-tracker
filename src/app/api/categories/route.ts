import { requireAdmin, requireAdminOrPermission } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { categoryInputSchema } from "@/lib/validation";

function serializeCategory(category: {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: { transactions: number };
}) {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    transactionCount: category._count?.transactions ?? 0,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    await requireAdminOrPermission(request, "CREATE_TRANSACTION");
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { transactions: true } } },
    });
    return jsonOk(categories.map(serializeCategory));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request);
    const input = categoryInputSchema.parse(await readJson(request));
    const category = await prisma.category.create({ data: input });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "create",
        entityType: "category",
        entityId: category.id,
        details: JSON.stringify({ name: category.name }),
      },
    });
    return jsonOk(serializeCategory(category), 201);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return jsonError("A category with that name already exists.", 409);
    }
    return handleRouteError(error);
  }
}
