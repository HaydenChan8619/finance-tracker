import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { importReviewSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

function serializeRow(row: {
  id: string;
  date: Date | null;
  merchantRaw: string;
  amountRaw: string;
  transactionTypeRaw: string | null;
  sourcePage: number | null;
  parsedConfidence: number | null;
  normalizedMerchant: string | null;
  amountCents: number | null;
  direction: string | null;
  categoryId: string | null;
  status: string;
  duplicateKind: string | null;
  duplicateTransactionId: string | null;
  reviewNote: string | null;
  committedTransactionId: string | null;
}) {
  return {
    ...row,
    date: row.date?.toISOString() ?? null,
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireAdmin(request);
    const { id } = await context.params;
    const batch = await prisma.importBatch.findUnique({
      where: { id },
      include: {
        importedTransactions: {
          orderBy: [{ status: "asc" }, { date: "asc" }],
          include: { category: true },
        },
      },
    });
    if (!batch) {
      return jsonError("Import batch not found.", 404);
    }
    return jsonOk({
      id: batch.id,
      sourceFilename: batch.sourceFilename,
      sourceAccount: batch.sourceAccount,
      statementPeriodStart: batch.statementPeriodStart?.toISOString() ?? null,
      statementPeriodEnd: batch.statementPeriodEnd?.toISOString() ?? null,
      parserVersion: batch.parserVersion,
      status: batch.status,
      totalRows: batch.totalRows,
      parsedRows: batch.parsedRows,
      reviewRows: batch.reviewRows,
      duplicateRows: batch.duplicateRows,
      createdAt: batch.createdAt.toISOString(),
      committedAt: batch.committedAt?.toISOString() ?? null,
      rows: batch.importedTransactions.map((row) => ({
        ...serializeRow(row),
        category: row.category,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireAdmin(request);
    const { id } = await context.params;
    const body = await readJson(request);
    if (!body || typeof body !== "object" || !("rowId" in body) || typeof body.rowId !== "string") {
      return jsonError("A rowId is required.", 422);
    }
    const rowId = body.rowId;
    const input = importReviewSchema.parse(body);
    const existing = await prisma.importedTransaction.findFirst({
      where: { id: rowId, importBatchId: id },
    });
    if (!existing) {
      return jsonError("Import row not found.", 404);
    }
    if (existing.status === "committed") {
      return jsonError("Committed import rows cannot be changed.", 409);
    }

    const category = input.categoryId
      ? await prisma.category.findUnique({ where: { id: input.categoryId } })
      : null;
    if (input.categoryId && !category) {
      return jsonError("Selected category was not found.", 422);
    }

    const row = await prisma.importedTransaction.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
        reviewNote: input.notes !== undefined ? input.notes : existing.reviewNote,
      },
      include: { category: true },
    });
    const [reviewRows, parsedRows, duplicateRows] = await Promise.all([
      prisma.importedTransaction.count({ where: { importBatchId: id, status: "review" } }),
      prisma.importedTransaction.count({ where: { importBatchId: id, status: "ready" } }),
      prisma.importedTransaction.count({ where: { importBatchId: id, duplicateKind: { not: null } } }),
    ]);
    await prisma.importBatch.update({
      where: { id },
      data: { reviewRows, parsedRows, duplicateRows },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "review",
        entityType: "imported_transaction",
        entityId: row.id,
        details: JSON.stringify({ status: input.status, categoryId: input.categoryId }),
      },
    });

    return jsonOk({ row: { ...serializeRow(row), category: row.category } });
  } catch (error) {
    return handleRouteError(error);
  }
}
