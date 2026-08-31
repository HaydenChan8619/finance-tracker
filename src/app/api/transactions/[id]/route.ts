import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { normalizeMerchant } from "@/lib/security";
import { serializeTransaction } from "@/lib/transactions";
import { transactionInputSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireAdmin(request);
    const { id } = await context.params;
    const input = transactionInputSchema.partial().parse(await readJson(request));

    let finalCategoryId: string | null | undefined = undefined;
    if (input.categoryId !== undefined) {
      if (input.categoryId) {
        const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
        if (!category) {
          return jsonError("Selected category was not found.", 422);
        }
        finalCategoryId = category.id;
      } else {
        const misc = await prisma.category.findUnique({ where: { name: "Misc" } });
        finalCategoryId = misc?.id ?? null;
      }
    }

    const data = {
      ...(input.merchant ? { merchant: input.merchant, normalizedMerchant: normalizeMerchant(input.merchant) } : {}),
      ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
      ...(input.direction !== undefined ? { direction: input.direction, ...(input.direction === "income" ? { isSocial: false, isDating: false } : {}) } : {}),
      ...(input.date !== undefined ? { date: input.date } : {}),
      ...(finalCategoryId !== undefined ? { categoryId: finalCategoryId } : {}),
      ...(input.isSocial !== undefined ? { isSocial: input.direction === "income" ? false : input.isSocial } : {}),
      ...(input.isDating !== undefined ? { isDating: input.direction === "income" ? false : input.isDating } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.predictionSource !== undefined ? { predictionSource: input.predictionSource } : {}),
    };
    const transaction = await prisma.transaction.update({
      where: { id },
      data,
      include: { category: true },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "update",
        entityType: "transaction",
        entityId: id,
        details: JSON.stringify(data),
      },
    });
    return jsonOk({ transaction: serializeTransaction(transaction) });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return jsonError("Transaction not found.", 404);
    }
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requireAdmin(request);
    const { id } = await context.params;
    await prisma.transaction.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "delete",
        entityType: "transaction",
        entityId: id,
      },
    });
    return jsonOk({ deleted: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return jsonError("Transaction not found.", 404);
    }
    return handleRouteError(error);
  }
}
