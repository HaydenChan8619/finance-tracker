import { z } from "zod";

export const directionSchema = z.enum(["expense", "income"]);

export const transactionInputSchema = z.object({
  id: z.string().min(8).max(80).optional(),
  merchant: z.string().trim().min(1).max(120),
  amountCents: z.number().int().positive().max(100_000_000),
  direction: directionSchema.default("expense"),
  date: z.coerce.date().optional(),
  categoryId: z.string().min(1).max(80).nullable().optional(),
  isSocial: z.boolean().default(false),
  isDating: z.boolean().default(false),
  notes: z.string().trim().max(500).nullable().optional(),
  source: z.enum(["manual", "mobile", "import"]).default("manual"),
  predictionSource: z.string().trim().max(60).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
});

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "Color must be a six-digit hex value")
    .default("#2a6f68"),
});

export const categoryRuleInputSchema = z.object({
  pattern: z.string().trim().min(1).max(120),
  categoryId: z.string().min(1).max(80),
  priority: z.number().int().min(0).max(1000).default(100),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export const enrollmentCreateSchema = z.object({
  deviceName: z.string().trim().min(1).max(80).default("iPhone"),
});

export const enrollmentCompleteSchema = z.object({
  code: z.string().trim().min(6).max(32),
  deviceName: z.string().trim().min(1).max(80).default("iPhone"),
});

export const predictionSchema = z.object({
  merchant: z.string().trim().min(1).max(120),
});

export const learnPredictionSchema = z.object({
  merchant: z.string().trim().min(1).max(120),
  categoryId: z.string().min(1).max(80),
});

export const importReviewSchema = z.object({
  status: z.enum(["ready", "review", "ignored"]).optional(),
  categoryId: z.string().min(1).max(80).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  merchantRaw: z.string().trim().min(1).max(255).optional(),
  amountCents: z.number().int().positive().max(100_000_000).optional(),
  amountRaw: z.string().trim().max(50).optional(),
  direction: directionSchema.optional(),
  date: z.coerce.date().nullable().optional(),
});

export const importAddRowSchema = z.object({
  merchantRaw: z.string().trim().min(1).max(255),
  amountCents: z.number().int().positive().max(100_000_000),
  direction: directionSchema.default("expense"),
  date: z.coerce.date().optional(),
  categoryId: z.string().min(1).max(80).nullable().optional(),
  status: z.enum(["ready", "review", "ignored"]).default("ready"),
  notes: z.string().trim().max(500).nullable().optional(),
});

export function parseAmountToCents(value: string) {
  const cleaned = value.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }

  const [whole, decimals = ""] = cleaned.split(".");
  const cents = Number(`${whole}${decimals.padEnd(2, "0")}`);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function formatCurrency(amountCents: number, direction?: string) {
  let sign = "";
  if (direction === "income") {
    sign = "+";
  } else if (direction === "expense") {
    sign = "-";
  } else if (amountCents < 0) {
    sign = "-";
  }
  return `${sign}${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Math.abs(amountCents) / 100)}`;
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
