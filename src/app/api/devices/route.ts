import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonOk, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/security";
import { enrollmentCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const devices = await prisma.device.findMany({ orderBy: { createdAt: "desc" } });
    return jsonOk(
      devices.map((device) => ({
        id: device.id,
        name: device.name,
        permissions: JSON.parse(device.permissions) as string[],
        lastUsedAt: device.lastUsedAt?.toISOString() ?? null,
        revokedAt: device.revokedAt?.toISOString() ?? null,
        createdAt: device.createdAt.toISOString(),
      })),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request);
    const input = enrollmentCreateSchema.parse(await readJson(request));
    const code = randomBytes(5).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.enrollmentToken.create({
      data: {
        codeHash: hashToken(code),
        deviceName: input.deviceName,
        expiresAt,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "create",
        entityType: "enrollment_token",
        details: JSON.stringify({ deviceName: input.deviceName, expiresAt }),
      },
    });

    const enrollUrl = new URL("/enroll", request.url);
    enrollUrl.searchParams.set("code", code);
    return jsonOk({ code, deviceName: input.deviceName, expiresAt: expiresAt.toISOString(), enrollUrl: enrollUrl.toString() }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
