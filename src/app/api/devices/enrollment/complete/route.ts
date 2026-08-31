import { NextResponse } from "next/server";
import { createOpaqueToken, hashToken } from "@/lib/security";
import { handleRouteError, jsonError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { setDeviceCookie } from "@/lib/auth";
import { checkEnrollmentRateLimit, clearEnrollmentRateLimit } from "@/lib/rate-limit";
import { enrollmentCompleteSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const rateLimit = checkEnrollmentRateLimit(request);
    if (!rateLimit.allowed) {
      const response = jsonError("Too many enrollment attempts. Generate a new code and try again later.", 429);
      response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
      return response;
    }
    const input = enrollmentCompleteSchema.parse(await readJson(request));
    const code = input.code.replace(/\s+/g, "").toUpperCase();
    const enrollment = await prisma.enrollmentToken.findUnique({
      where: { codeHash: hashToken(code) },
    });

    if (!enrollment || enrollment.usedAt || enrollment.expiresAt <= new Date()) {
      return jsonError("That enrollment code is invalid or expired.", 401);
    }

    const token = createOpaqueToken();
    const device = await prisma.$transaction(async (tx) => {
      const claimed = await tx.enrollmentToken.updateMany({
        where: {
          id: enrollment.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) {
        return null;
      }

      return tx.device.create({
        data: {
          name: input.deviceName || enrollment.deviceName || "iPhone",
          tokenHash: hashToken(token),
        },
      });
    });

    if (!device) {
      return jsonError("That enrollment code was just used. Generate a new one.", 409);
    }

    clearEnrollmentRateLimit(rateLimit.key);
    const response = NextResponse.json(
      {
        enrolled: true,
        device: { id: device.id, name: device.name },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    setDeviceCookie(response, token);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
