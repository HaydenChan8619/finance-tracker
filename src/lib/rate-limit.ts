type Attempt = { count: number; resetAt: number };

const attempts = new Map<string, Attempt>();
const enrollmentAttempts = new Map<string, Attempt>();
const windowMs = 15 * 60 * 1000;
const maxAttempts = 8;

export function loginRateLimitKey(request: Request, email: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = request.headers.get("x-real-ip") ?? forwarded ?? "local";
  return `${address}:${email.toLocaleLowerCase("en-US")}`;
}

export function checkLoginRateLimit(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= maxAttempts) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(Math.ceil((current.resetAt - now) / 1000), 1),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearLoginRateLimit(key: string) {
  attempts.delete(key);
}

export function checkEnrollmentRateLimit(request: Request) {
  const address = request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  const now = Date.now();
  const current = enrollmentAttempts.get(address);
  if (!current || current.resetAt <= now) {
    enrollmentAttempts.set(address, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0, key: address };
  }

  if (current.count >= maxAttempts) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(Math.ceil((current.resetAt - now) / 1000), 1),
      key: address,
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0, key: address };
}

export function clearEnrollmentRateLimit(key: string) {
  enrollmentAttempts.delete(key);
}
