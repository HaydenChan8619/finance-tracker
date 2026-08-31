import { requireAdminOrPermission } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/api";
import { predictCategory } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { normalizeMerchant } from "@/lib/security";
import { learnPredictionSchema, predictionSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    await requireAdminOrPermission(request, "CREATE_TRANSACTION");
    const merchant = predictionSchema.parse({
      merchant: new URL(request.url).searchParams.get("merchant") ?? "",
    }).merchant;
    const [categories, history, rules] = await Promise.all([
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      prisma.transaction.findMany({
        where: { categoryId: { not: null } },
        select: { normalizedMerchant: true, categoryId: true, category: { select: { name: true } } },
        orderBy: { date: "desc" },
        take: 5000,
      }),
      prisma.categoryRule.findMany({
        select: { pattern: true, categoryId: true, priority: true },
        orderBy: { priority: "desc" },
      }),
    ]);

    return jsonOk({
      merchant,
      prediction: predictCategory(merchant, categories, history, rules),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAdminOrPermission(request, "CREATE_TRANSACTION");
    const input = learnPredictionSchema.parse(await readJson(request));
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) {
      return jsonError("Selected category was not found.", 422);
    }

    const pattern = normalizeMerchant(input.merchant);
    const rule = await prisma.categoryRule.upsert({
      where: {
        pattern_categoryId: {
          pattern,
          categoryId: input.categoryId,
        },
      },
      create: { pattern, categoryId: input.categoryId, priority: 100 },
      update: { priority: 100 },
      include: { category: true },
    });

    if (access.kind === "admin") {
      await prisma.auditLog.create({
        data: {
          userId: access.user.id,
          action: "learn",
          entityType: "category_rule",
          entityId: rule.id,
          details: JSON.stringify({ pattern, categoryId: input.categoryId }),
        },
      });
    }

    return jsonOk({
      rule: {
        id: rule.id,
        pattern: rule.pattern,
        priority: rule.priority,
        category: rule.category,
      },
    }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
