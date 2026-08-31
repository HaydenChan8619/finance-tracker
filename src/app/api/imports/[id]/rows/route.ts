import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { normalizeMerchant } from "@/lib/security";
import { formatCurrency, importAddRowSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireAdmin(request);
    const { id } = await context.params;
    const batch = await prisma.importBatch.findUnique({
      where: { id },
    });
    if (!batch) {
      return jsonError("Import batch not found.", 404);
    }
    if (batch.status === "committed") {
      return jsonError("Cannot add rows to an already committed batch.", 409);
    }

    const body = await readJson(request);
    const input = importAddRowSchema.parse(body);

    const category = input.categoryId
      ? await prisma.category.findUnique({ where: { id: input.categoryId } })
      : null;
    if (input.categoryId && !category) {
      return jsonError("Selected category was not found.", 422);
    }

    const misc = await prisma.category.findUnique({ where: { name: "Misc" } });
    const finalCategoryId = category ? category.id : (misc?.id ?? null);

    const date = input.date ?? new Date();
    const normalizedMerchant = normalizeMerchant(input.merchantRaw);

    // Duplicate check
    const match = await prisma.transaction.findFirst({
      where: {
        date,
        amountCents: input.amountCents,
      },
    });
    const duplicateKind = match ? (match.normalizedMerchant === normalizedMerchant ? "exact" : "probable") : null;

    const row = await prisma.importedTransaction.create({
      data: {
        importBatchId: id,
        merchantRaw: input.merchantRaw,
        normalizedMerchant,
        amountCents: input.amountCents,
        amountRaw: formatCurrency(input.amountCents, input.direction),
        direction: input.direction,
        date,
        status: input.status,
        categoryId: finalCategoryId,
        reviewNote: input.notes ?? null,
        duplicateKind,
        parsedConfidence: 100,
      },
      include: { category: true },
    });

    const [totalRows, reviewRows, parsedRows, duplicateRows] = await Promise.all([
      prisma.importedTransaction.count({ where: { importBatchId: id } }),
      prisma.importedTransaction.count({ where: { importBatchId: id, status: "review" } }),
      prisma.importedTransaction.count({ where: { importBatchId: id, status: "ready" } }),
      prisma.importedTransaction.count({ where: { importBatchId: id, duplicateKind: { not: null } } }),
    ]);

    await prisma.importBatch.update({
      where: { id },
      data: { totalRows, reviewRows, parsedRows, duplicateRows },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "create",
        entityType: "imported_transaction",
        entityId: row.id,
        details: JSON.stringify({ manual: true, merchant: row.merchantRaw, amountCents: row.amountCents }),
      },
    });

    return jsonOk({
      row: {
        ...row,
        date: row.date?.toISOString() ?? null,
      },
    }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
