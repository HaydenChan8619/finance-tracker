import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string; rowId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requireAdmin(request);
    const { id, rowId } = await context.params;

    const existing = await prisma.importedTransaction.findFirst({
      where: { id: rowId, importBatchId: id },
    });
    if (!existing) {
      return jsonError("Import row not found.", 404);
    }
    if (existing.status === "committed") {
      return jsonError("Cannot delete an already committed row.", 409);
    }

    await prisma.importedTransaction.delete({
      where: { id: rowId },
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
        action: "delete",
        entityType: "imported_transaction",
        entityId: rowId,
        details: JSON.stringify({ importBatchId: id, merchant: existing.merchantRaw }),
      },
    });

    return jsonOk({ deleted: true, rowId, totalRows, reviewRows, parsedRows, duplicateRows });
  } catch (error) {
    return handleRouteError(error);
  }
}
