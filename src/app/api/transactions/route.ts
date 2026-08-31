import { randomUUID } from "node:crypto";
import { requireAdmin, requireAdminOrPermission } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { normalizeMerchant } from "@/lib/security";
import { serializeTransaction } from "@/lib/transactions";
import { transactionInputSchema } from "@/lib/validation";

const transactionInclude = { category: true } as const;

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const page = Math.max(Number(url.searchParams.get("page") ?? "1") || 1, 1);
    const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? "25") || 25, 1), 100);
    const search = url.searchParams.get("q")?.trim();
    const direction = url.searchParams.get("direction");
    const categoryId = url.searchParams.get("categoryId");
    const social = url.searchParams.get("social");
    const dating = url.searchParams.get("dating");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const date =
      from || to
        ? {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          }
        : undefined;

    const isSocialSearch = search && (search.toLowerCase() === "social" || search.toLowerCase() === "#social");
    const isDatingSearch = search && (search.toLowerCase() === "dating" || search.toLowerCase() === "#dating");

    const where = {
      ...(search
        ? isSocialSearch
          ? {
              OR: [
                { isSocial: true },
                { merchant: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : isDatingSearch
            ? {
                OR: [
                  { isDating: true },
                  { merchant: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {
                OR: [
                  { merchant: { contains: search, mode: "insensitive" as const } },
                  { notes: { contains: search, mode: "insensitive" as const } },
                ],
              }
        : {}),
      ...(direction === "expense" || direction === "income" ? { direction } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(social === "true" ? { isSocial: true } : social === "false" ? { isSocial: false } : {}),
      ...(dating === "true" ? { isDating: true } : dating === "false" ? { isDating: false } : {}),
      ...(date ? { date } : {}),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: transactionInclude,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.transaction.count({ where }),
    ]);

    return jsonOk({
      transactions: transactions.map(serializeTransaction),
      pagination: {
        page,
        pageSize,
        total,
        pageCount: Math.max(Math.ceil(total / pageSize), 1),
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAdminOrPermission(request, "CREATE_TRANSACTION");
    const input = transactionInputSchema.parse(await readJson(request));

    if (input.idempotencyKey) {
      const existing = await prisma.transaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: transactionInclude,
      });
      if (existing) {
        return jsonOk({ transaction: serializeTransaction(existing), idempotent: true });
      }
    }

    const id = input.id ?? randomUUID();
    const existingById = await prisma.transaction.findUnique({ where: { id } });
    if (existingById) {
      if (access.kind === "device") {
        return jsonError("This transaction ID is already in use.", 409);
      }
      return jsonOk({
        transaction: serializeTransaction(
          await prisma.transaction.findUniqueOrThrow({
            where: { id },
            include: transactionInclude,
          }),
        ),
        idempotent: true,
      });
    }

    let finalCategoryId = input.categoryId ?? null;
    let selectedCategory: { id: string; name: string } | null = null;

    if (finalCategoryId) {
      selectedCategory = await prisma.category.findUnique({ where: { id: finalCategoryId } });
      if (!selectedCategory) {
        return jsonError("Selected category was not found.", 422);
      }
    } else {
      const misc = await prisma.category.findUnique({ where: { name: "Misc" } });
      if (misc) {
        finalCategoryId = misc.id;
        selectedCategory = misc;
      }
    }

    const isIncome = selectedCategory?.name.toLowerCase() === "income" || input.direction === "income";
    const direction = isIncome ? "income" : input.direction;

    const transaction = await prisma.transaction.create({
      data: {
        id,
        merchant: input.merchant,
        normalizedMerchant: normalizeMerchant(input.merchant),
        amountCents: input.amountCents,
        direction,
        date: input.date ?? new Date(),
        categoryId: finalCategoryId,
        isSocial: direction === "income" ? false : input.isSocial,
        isDating: direction === "income" ? false : input.isDating,
        notes: input.notes ?? null,
        source: access.kind === "device" ? "mobile" : input.source,
        predictionSource: input.predictionSource ?? null,
        idempotencyKey: input.idempotencyKey ?? id,
      },
      include: transactionInclude,
    });

    if (access.kind === "admin") {
      await prisma.auditLog.create({
        data: {
          userId: access.user.id,
          action: "create",
          entityType: "transaction",
          entityId: transaction.id,
          details: JSON.stringify({ source: transaction.source }),
        },
      });
    }

    return jsonOk({ transaction: serializeTransaction(transaction), idempotent: false }, 201);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return jsonError("This transaction was already submitted.", 409);
    }
    return handleRouteError(error);
  }
}
