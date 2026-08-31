import { requireAdminOrPermission } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { serializeTransaction } from "@/lib/transactions";

export async function GET(request: Request) {
  try {
    await requireAdminOrPermission(request, "READ_RECENT_TRANSACTIONS");
    const transactions = await prisma.transaction.findMany({
      take: 20,
      orderBy: { date: "desc" },
      include: { category: true },
    });
    return jsonOk(transactions.map(serializeTransaction));
  } catch (error) {
    return handleRouteError(error);
  }
}
