import { createHash } from "node:crypto";
import { PDFParse } from "pdf-parse";
import { normalizeMerchant } from "@/lib/security";

export const PARSER_VERSION = "td-text-v1";

export type ParsedImportRow = {
  date: Date | null;
  merchantRaw: string;
  amountRaw: string;
  transactionTypeRaw: string | null;
  sourcePage: number | null;
  parsedConfidence: number;
  normalizedMerchant: string | null;
  amountCents: number | null;
  direction: "expense" | "income" | null;
  status: "ready" | "review";
  reviewNote: string | null;
  fingerprint: string | null;
};

function parseDate(raw: string) {
  const namedMonth = raw.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{2,4}))?$/);
  if (namedMonth) {
    const month = new Date(`${namedMonth[1]} 1, 2000`).getUTCMonth();
    const day = Number(namedMonth[2]);
    const yearPart = namedMonth[3] ? Number(namedMonth[3]) : new Date().getUTCFullYear();
    const year = yearPart < 100 ? 2000 + yearPart : yearPart;
    const result = new Date(Date.UTC(year, month, day));
    return result.getUTCMonth() === month && result.getUTCDate() === day ? result : null;
  }

  const parts = raw.split(/[/-]/).map(Number);
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [month, day, yearPart] = parts;
  const year = yearPart
    ? yearPart < 100
      ? 2000 + yearPart
      : yearPart
    : new Date().getUTCFullYear();
  const result = new Date(Date.UTC(year, month - 1, day));
  return result.getUTCMonth() === month - 1 && result.getUTCDate() === day ? result : null;
}

function parseAmount(raw: string) {
  const isNegative = raw.includes("-") || (raw.startsWith("(") && raw.endsWith(")"));
  const cleaned = raw.replace(/[($,\s+)-]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  const [whole, decimals = ""] = cleaned.split(".");
  const cents = Number(`${whole}${decimals.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    return null;
  }
  return { cents, isNegative };
}

function inferDirection(line: string, amountWasNegative: boolean) {
  const upper = line.toLocaleUpperCase("en-US");
  if (amountWasNegative || /\b(DEBIT|WITHDRAWAL|PURCHASE|CHARGE)\b/.test(upper)) {
    return "expense" as const;
  }
  if (/\b(CREDIT|DEPOSIT|REFUND|INTEREST|PAYROLL)\b/.test(upper)) {
    return "income" as const;
  }
  return "income" as const;
}

function fingerprint(row: Pick<ParsedImportRow, "date" | "amountCents" | "normalizedMerchant" | "direction">) {
  if (!row.date || !row.amountCents || !row.normalizedMerchant || !row.direction) {
    return null;
  }
  return createHash("sha256")
    .update(
      [
        row.date.toISOString().slice(0, 10),
        row.amountCents,
        row.normalizedMerchant,
        row.direction,
      ].join("|"),
    )
    .digest("hex");
}

export function parseStatementText(text: string): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    const dateMatch = line.match(
      /\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{2,4})?)\b/i,
    );
    const amountMatches = [...line.matchAll(/(?:\(?-?\$?\s?\d[\d,]*\.\d{2}\)?)/g)];
    const amountMatch = amountMatches.at(-1);
    if (!dateMatch || !amountMatch) {
      continue;
    }

    const date = parseDate(dateMatch[1]);
    const amount = parseAmount(amountMatch[0]);
    const merchant = line
      .replace(dateMatch[0], "")
      .replace(amountMatch[0], "")
      .replace(/\b(DEBIT|CREDIT|WITHDRAWAL|PURCHASE|CHARGE|DEPOSIT)\b/gi, "")
      .trim()
      .replace(/^[|:;–—-]+|[|:;–—-]+$/g, "")
      .trim();
    const normalized = merchant ? normalizeMerchant(merchant) : null;
    const direction = amount ? inferDirection(line, amount.isNegative) : null;
    const confidence = date && amount && merchant ? (dateMatch[1].includes("/") ? 90 : 75) : 35;
    const row: ParsedImportRow = {
      date,
      merchantRaw: merchant || line,
      amountRaw: amountMatch[0],
      transactionTypeRaw: line.match(/\b(DEBIT|CREDIT|WITHDRAWAL|PURCHASE|CHARGE|DEPOSIT)\b/i)?.[0] ?? null,
      sourcePage: null,
      parsedConfidence: confidence,
      normalizedMerchant: normalized,
      amountCents: amount?.cents ?? null,
      direction,
      status: confidence >= 75 && Boolean(date && amount && normalized) ? "ready" : "review",
      reviewNote:
        confidence >= 75 && date && amount && normalized
          ? null
          : "Check the date, merchant, and amount before importing.",
      fingerprint: fingerprint({ date, amountCents: amount?.cents ?? null, normalizedMerchant: normalized, direction }),
    };
    rows.push(row);
  }

  return rows;
}

export async function parsePdfBuffer(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return parseStatementText(result.text);
  } finally {
    await parser.destroy();
  }
}

export function detectInBatch(rows: ParsedImportRow[]) {
  const seen = new Set<string>();
  return rows.map((row) => {
    if (!row.fingerprint) {
      return row;
    }
    if (seen.has(row.fingerprint)) {
      return {
        ...row,
        status: "review" as const,
        reviewNote: "This row repeats another row in the same statement.",
      };
    }
    seen.add(row.fingerprint);
    return row;
  });
}
