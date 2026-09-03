import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const batchUpdateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one transaction ID is required."),
  updates: z.object({
    isSocial: z.boolean().optional(),
    isDating: z.boolean().optional(),
    categoryId: z.string().nullable().optional(),
  }),
});

const batchDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one transaction ID is required."),
});

export async function PATCH(request: Request) {
  try {
    const session = await requireAdmin(request);
    const body = await readJson(request);
    const { ids, updates } = batchUpdateSchema.parse(body);

    let finalCategoryId: string | null | undefined = undefined;
    if (updates.categoryId !== undefined) {
      if (updates.categoryId) {
        const category = await prisma.category.findUnique({ where: { id: updates.categoryId } });
        if (!category) {
          return jsonError("Selected category was not found.", 422);
        }
        finalCategoryId = category.id;
      } else {
        const misc = await prisma.category.findUnique({ where: { name: "Misc" } });
        finalCategoryId = misc?.id ?? null;
      }
    }

    const updatedCount = await prisma.$transaction(async (tx) => {
      let count = 0;

      if (finalCategoryId !== undefined) {
        const res = await tx.transaction.updateMany({
          where: { id: { in: ids } },
          data: { categoryId: finalCategoryId },
        });
        count = Math.max(count, res.count);
      }

      if (updates.isSocial !== undefined) {
        if (updates.isSocial) {
          const res = await tx.transaction.updateMany({
            where: { id: { in: ids }, direction: "expense" },
            data: { isSocial: true },
          });
          count = Math.max(count, res.count);
        } else {
          const res = await tx.transaction.updateMany({
            where: { id: { in: ids } },
            data: { isSocial: false },
          });
          count = Math.max(count, res.count);
        }
      }

      if (updates.isDating !== undefined) {
        if (updates.isDating) {
          const res = await tx.transaction.updateMany({
            where: { id: { in: ids }, direction: "expense" },
            data: { isDating: true },
          });
          count = Math.max(count, res.count);
        } else {
          const res = await tx.transaction.updateMany({
            where: { id: { in: ids } },
            data: { isDating: false },
          });
          count = Math.max(count, res.count);
        }
      }

      return count;
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "batch_update",
        entityType: "transaction",
        entityId: `batch:${ids.length}`,
        details: JSON.stringify({ idsCount: ids.length, updates }),
      },
    });

    return jsonOk({ success: true, count: updatedCount });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireAdmin(request);
    const body = await readJson(request);
    const { ids } = batchDeleteSchema.parse(body);

    const result = await prisma.transaction.deleteMany({
      where: { id: { in: ids } },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "batch_delete",
        entityType: "transaction",
        entityId: `batch:${ids.length}`,
        details: JSON.stringify({ idsCount: ids.length, deletedCount: result.count }),
      },
    });

    return jsonOk({ success: true, count: result.count });
  } catch (error) {
    return handleRouteError(error);
  }
}
