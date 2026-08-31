import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireAdmin(request);
    const { id } = await context.params;
    const batch = await prisma.importBatch.findUnique({
      where: { id },
      include: {
        importedTransactions: {
          where: { status: "ready" },
        },
      },
    });

    if (!batch) {
      return jsonError("Import batch not found.", 404);
    }
    if (batch.status === "committed") {
      return jsonError("This import batch has already been committed.", 409);
    }
    const invalidRows = batch.importedTransactions.filter(
      (row) => !row.date || !row.amountCents || !row.normalizedMerchant || !row.direction,
    );
    if (invalidRows.length > 0) {
      return jsonError(`${invalidRows.length} ready row(s) still need valid date, merchant, amount, or direction.`, 422);
    }
    if (batch.importedTransactions.length === 0) {
      return jsonError("There are no ready rows to import.", 422);
    }

    const miscCategory = await prisma.category.findUnique({ where: { name: "Misc" } });
    const defaultCategoryId = miscCategory?.id ?? null;

    const committedAt = new Date();
    const transactionData = batch.importedTransactions.map((row) => ({
      rowId: row.id,
      transaction: {
        id: randomUUID(),
        merchant: row.merchantRaw,
        normalizedMerchant: row.normalizedMerchant as string,
        amountCents: row.amountCents as number,
        direction: row.direction as string,
        date: row.date as Date,
        categoryId: row.categoryId || defaultCategoryId,
        notes: row.reviewNote,
        source: "import",
        importBatchId: batch.id,
        idempotencyKey: `import:${batch.id}:${row.id}`,
      },
    }));

    const created = await prisma.$transaction(
      async (tx) => {
        await tx.transaction.createMany({
          data: transactionData.map((t) => t.transaction),
        });

        await tx.importedTransaction.updateMany({
          where: {
            id: { in: batch.importedTransactions.map((r) => r.id) },
          },
          data: { status: "committed" },
        });

        await tx.importBatch.update({
          where: { id: batch.id },
          data: { status: "committed", committedAt },
        });

        return transactionData;
      },
      {
        timeout: 30000,
        maxWait: 10000,
      },
    );

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "commit",
        entityType: "import_batch",
        entityId: batch.id,
        details: JSON.stringify({ transactions: created.length }),
      },
    });

    return jsonOk({ committed: true, transactionCount: created.length, committedAt: committedAt.toISOString() });
  } catch (error) {
    return handleRouteError(error);
  }
}
