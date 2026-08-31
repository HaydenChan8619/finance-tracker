import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { normalizeMerchant } from "@/lib/security";
import { formatCurrency, importReviewSchema } from "@/lib/validation";

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
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
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

    const newMerchant = input.merchantRaw !== undefined ? input.merchantRaw : existing.merchantRaw;
    const normalizedMerchant = newMerchant ? normalizeMerchant(newMerchant) : existing.normalizedMerchant;
    const newAmountCents = input.amountCents !== undefined ? input.amountCents : existing.amountCents;
    const newDirection = input.direction !== undefined ? input.direction : existing.direction;
    const newDate = input.date !== undefined ? input.date : existing.date;
    const newStatus = input.status !== undefined ? input.status : existing.status;

    // Check duplicate status if key attributes changed
    let duplicateKind = existing.duplicateKind;
    if (newDate && newAmountCents && normalizedMerchant) {
      const match = await prisma.transaction.findFirst({
        where: {
          date: newDate,
          amountCents: newAmountCents,
        },
      });
      if (match) {
        duplicateKind = match.normalizedMerchant === normalizedMerchant ? "exact" : "probable";
      } else {
        duplicateKind = null;
      }
    }

    const row = await prisma.importedTransaction.update({
      where: { id: existing.id },
      data: {
        merchantRaw: newMerchant,
        normalizedMerchant,
        amountCents: newAmountCents,
        amountRaw: input.amountRaw || (newAmountCents ? formatCurrency(newAmountCents, newDirection || undefined) : existing.amountRaw),
        direction: newDirection,
        date: newDate,
        status: newStatus,
        categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
        reviewNote: input.notes !== undefined ? input.notes : (newStatus === "ready" ? null : existing.reviewNote),
        duplicateKind,
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
        details: JSON.stringify({ status: row.status, merchant: row.merchantRaw, amountCents: row.amountCents }),
      },
    });

    return jsonOk({ row: { ...serializeRow(row), category: row.category } });
  } catch (error) {
    return handleRouteError(error);
  }
}
