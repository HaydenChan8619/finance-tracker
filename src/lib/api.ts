import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError } from "@/lib/auth";

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

export function handleRouteError(error: unknown) {
  if (error instanceof AuthError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof z.ZodError) {
    return jsonError("Please check the highlighted fields.", 422, error.issues);
  }

  if (error instanceof Error && error.message === "Request body must be valid JSON") {
    return jsonError(error.message, 400);
  }

  console.error(error);
  return jsonError("Something went wrong on the server.", 500);
}

export function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}
