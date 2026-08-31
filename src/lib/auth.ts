import bcrypt from "bcryptjs";
import { type NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createOpaqueToken,
  hashToken,
  parsePermissions,
  safeEqual,
} from "@/lib/security";

export const SESSION_COOKIE = "finance_session";
export const DEVICE_COOKIE = "finance_device";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export class AuthError extends Error {
  status: 401 | 403;

  constructor(message = "Authentication required", status: 401 | 403 = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

type UserRecord = Awaited<ReturnType<typeof prisma.user.findUnique>>;
type DeviceRecord = Awaited<ReturnType<typeof prisma.device.findUnique>>;

export type RequestAccess =
  | { kind: "admin"; user: NonNullable<UserRecord> }
  | { kind: "device"; device: NonNullable<DeviceRecord>; permissions: string[] };

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

function cookieIsSecure() {
  return process.env.NODE_ENV === "production";
}

export function assertAuthConfiguration() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.trim().length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production.");
  }
  if (!process.env.ADMIN_EMAIL?.trim()) {
    throw new Error("ADMIN_EMAIL is required in production.");
  }
  if (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH?.trim()) {
    throw new Error("ADMIN_PASSWORD is required in production.");
  }
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: cookieIsSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function setDeviceCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: DEVICE_COOKIE,
    value: token,
    httpOnly: true,
    secure: cookieIsSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 4,
  });
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: cookieIsSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set({
    name: DEVICE_COOKIE,
    value: "",
    httpOnly: true,
    secure: cookieIsSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getAdminSession(request: Request) {
  assertAuthConfiguration();
  const rawToken = readCookie(request, SESSION_COOKIE);
  if (!rawToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date()) {
    return null;
  }

  return session;
}

export async function getDeviceSession(request: Request) {
  const rawToken = readCookie(request, DEVICE_COOKIE);
  if (!rawToken) {
    return null;
  }

  const device = await prisma.device.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });

  if (!device || device.revokedAt) {
    return null;
  }

  return device;
}

export async function getRequestAccess(request: Request): Promise<RequestAccess | null> {
  const adminSession = await getAdminSession(request);
  if (adminSession) {
    return { kind: "admin", user: adminSession.user };
  }

  const device = await getDeviceSession(request);
  if (device) {
    void prisma.device.update({
      where: { id: device.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => undefined);
    return {
      kind: "device",
      device,
      permissions: parsePermissions(device.permissions),
    };
  }

  return null;
}

export async function requireAdmin(request: Request) {
  const session = await getAdminSession(request);
  if (!session) {
    throw new AuthError();
  }

  return session;
}

export async function requireAdminOrPermission(request: Request, permission: string) {
  const access = await getRequestAccess(request);
  if (!access) {
    throw new AuthError();
  }

  if (access.kind === "admin" || access.permissions.includes(permission)) {
    return access;
  }

  throw new AuthError("This device is not allowed to perform that action", 403);
}

export async function checkAdminPassword(email: string, password: string) {
  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLocaleLowerCase("en-US");
  if (!configuredEmail || !safeEqual(email.toLocaleLowerCase("en-US"), configuredEmail)) {
    return false;
  }

  const configuredHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (configuredHash) {
    return bcrypt.compare(password, configuredHash);
  }

  const configuredPassword = process.env.ADMIN_PASSWORD;
  return Boolean(configuredPassword && safeEqual(password, configuredPassword));
}

export async function ensureAdminUser(email: string, password: string) {
  const passwordHash =
    process.env.ADMIN_PASSWORD_HASH?.trim() || (await bcrypt.hash(password, 12));

  return prisma.user.upsert({
    where: { email },
    create: { email, passwordHash },
    update: { passwordHash },
  });
}

export async function createAdminSession(userId: string) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function destroyAdminSession(request: Request) {
  const rawToken = readCookie(request, SESSION_COOKIE);
  if (rawToken) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
  }
}

export function hasAccessPermission(access: RequestAccess, permission: string) {
  return access.kind === "admin" || access.permissions.includes(permission);
}
