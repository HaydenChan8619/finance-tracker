import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireAdmin(request);
    const { id } = await context.params;
    const device = await prisma.device.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "revoke",
        entityType: "device",
        entityId: id,
      },
    });
    return jsonOk({ revoked: true, revokedAt: device.revokedAt?.toISOString() });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return jsonError("Device not found.", 404);
    }
    return handleRouteError(error);
  }
}
