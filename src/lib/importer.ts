import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import Tesseract from "tesseract.js";
import { normalizeMerchant } from "@/lib/security";

export const PARSER_VERSION = "td-text-v1";
export const OCR_PARSER_VERSION = "td-ocr-v1";
export const PDF_PARSER_VERSION = "td-pdf-v1";

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

const IGNORED_LINE_PATTERNS = [
  /\baccount\s+summary\b/i,
  /\b(beginning|opening)\s+balance\b/i,
  /\b(ending|closing)\s+balance\b/i,
  /\btotal\s+(debits|credits|deposits|withdrawals|checks)\b/i,
  /\bpage\s+\d+\s+of\s+\d+\b/i,
  /\bstatement\s+period\b/i,
  /\bfor\s+questions\s+call\b/i,
  /\binterest\s+rate\s+summary\b/i,
  /\bdate\s+description\s+(amount|withdrawals|deposits|balance)\b/i,
  /\bdate\s+merchant\s+amount\b/i,
];

function parseDate(raw: string): Date | null {
  const trimmed = raw.trim();

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const result = new Date(Date.UTC(year, month, day));
    return result.getUTCFullYear() === year && result.getUTCMonth() === month && result.getUTCDate() === day ? result : null;
  }

  // MM/DD/YYYY, MM/DD/YY, MM-DD-YYYY, MM-DD-YY, MM.DD.YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]) - 1;
    const day = Number(slashMatch[2]);
    const yearPart = slashMatch[3] ? Number(slashMatch[3]) : new Date().getUTCFullYear();
    const year = yearPart < 100 ? (yearPart > 50 ? 1900 + yearPart : 2000 + yearPart) : yearPart;
    const result = new Date(Date.UTC(year, month, day));
    return result.getUTCFullYear() === year && result.getUTCMonth() === month && result.getUTCDate() === day ? result : null;
  }

  // Month DD, YYYY or Month DD YYYY or Month DD (e.g. Aug 18, 2026, August 24 2026, Aug 22)
  const namedMonth = trimmed.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:[,\s]+(\d{2,4}))?$/i);
  if (namedMonth) {
    const monthStr = namedMonth[1].slice(0, 3).toLowerCase();
    const monthMap: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    if (monthMap[monthStr] !== undefined) {
      const month = monthMap[monthStr];
      const day = Number(namedMonth[2]);
      const yearPart = namedMonth[3] ? Number(namedMonth[3]) : new Date().getUTCFullYear();
      const year = yearPart < 100 ? 2000 + yearPart : yearPart;
      const result = new Date(Date.UTC(year, month, day));
      return result.getUTCMonth() === month && result.getUTCDate() === day ? result : null;
    }
  }

  // DD Mon YYYY or DD-Mon-YYYY (e.g. 18 Aug 2026, 18-Aug-2026)
  const dayFirst = trimmed.match(/^(\d{1,2})[-/\s]+([A-Za-z]{3,9})(?:[-/\s]+(\d{2,4}))?$/i);
  if (dayFirst) {
    const monthStr = dayFirst[2].slice(0, 3).toLowerCase();
    const monthMap: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    if (monthMap[monthStr] !== undefined) {
      const month = monthMap[monthStr];
      const day = Number(dayFirst[1]);
      const yearPart = dayFirst[3] ? Number(dayFirst[3]) : new Date().getUTCFullYear();
      const year = yearPart < 100 ? 2000 + yearPart : yearPart;
      const result = new Date(Date.UTC(year, month, day));
      return result.getUTCMonth() === month && result.getUTCDate() === day ? result : null;
    }
  }

  return null;
}

function parseAmount(raw: string) {
  // Normalize OCR artifacts: S12.50 -> $12.50
  const cleaned = raw.trim().replace(/^[sS](\d)/, "$$$1");
  const isNegative =
    cleaned.includes("-") ||
    (cleaned.startsWith("(") && cleaned.endsWith(")")) ||
    /\b(DR|DEBIT)\b/i.test(cleaned);
  const isExplicitPositive = cleaned.includes("+") || /\b(CR|CREDIT)\b/i.test(cleaned);

  const numPart = cleaned.replace(/[($,\s+)-]|CR|DR|DEBIT|CREDIT/gi, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(numPart)) {
    return null;
  }
  const [whole, decimals = ""] = numPart.split(".");
  const cents = Number(`${whole}${decimals.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    return null;
  }
  return { cents, isNegative, isExplicitPositive };
}

function inferDirection(line: string, amount: { isNegative: boolean; isExplicitPositive: boolean }) {
  if (amount.isExplicitPositive) {
    return "income" as const;
  }
  if (amount.isNegative) {
    return "expense" as const;
  }

  const upper = line.toLocaleUpperCase("en-US");
  if (/\b(DEBIT|WITHDRAWAL|PURCHASE|CHARGE|PAYMENT|FEE|CHECK|POS|ATM)\b/.test(upper)) {
    return "expense" as const;
  }
  if (/\b(CREDIT|DEPOSIT|REFUND|INTEREST|PAYROLL|SALARY|CASHBACK|ACH\s+CREDIT)\b/.test(upper)) {
    return "income" as const;
  }

  return "expense" as const;
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
    // Check if line should be skipped (e.g. header or account summary line)
    if (IGNORED_LINE_PATTERNS.some((pattern) => pattern.test(line))) {
      continue;
    }

    // Match dates: MM/DD/YYYY, YYYY-MM-DD, Month DD YYYY, DD-Mon-YYYY, etc.
    const dateMatch = line.match(
      /\b(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:[,\s]+\d{2,4})?|\d{1,2}[-/\s]+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:[-/\s]+\d{2,4})?)\b/i,
    );

    // Match currency amounts: $1,234.56, 123.45, (45.00), -$25.00, S12.50
    const amountMatches = [
      ...line.matchAll(/(?:\(?-?[+$sS]?\s?\d[\d,]*\.\d{2}\)?(?:\s?(?:CR|DR))?)/g),
    ];

    if (!dateMatch || amountMatches.length === 0) {
      continue;
    }

    const date = parseDate(dateMatch[1]);
    if (!date) {
      continue;
    }

    // If there are multiple amount columns (e.g. Withdrawal, Deposit, Balance), select transaction amount
    let selectedAmountMatch = amountMatches.at(-1)!;
    if (amountMatches.length >= 2) {
      selectedAmountMatch = amountMatches[0];
    }

    const amount = parseAmount(selectedAmountMatch[0]);
    if (!amount) {
      continue;
    }

    // Extract merchant description by removing the date and all amount strings and OCR separators
    let merchant = line.replace(dateMatch[0], "");
    for (const match of amountMatches) {
      merchant = merchant.replace(match[0], "");
    }
    merchant = merchant
      .replace(/\b(DEBIT|CREDIT|WITHDRAWAL|PURCHASE|CHARGE|DEPOSIT)\b/gi, "")
      .trim()
      .replace(/^[|:;–—\-#\s]+|[|:;–—\-#\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!merchant || merchant.length < 2) {
      merchant = "Transaction";
    }

    const normalized = normalizeMerchant(merchant);
    const direction = inferDirection(line, amount);
    const confidence = date && amount && normalized && normalized !== "transaction" ? (dateMatch[1].includes("/") || dateMatch[1].includes("-") ? 90 : 80) : 45;

    const row: ParsedImportRow = {
      date,
      merchantRaw: merchant,
      amountRaw: selectedAmountMatch[0],
      transactionTypeRaw: line.match(/\b(DEBIT|CREDIT|WITHDRAWAL|PURCHASE|CHARGE|DEPOSIT|PAYMENT|CHECK)\b/i)?.[0] ?? null,
      sourcePage: null,
      parsedConfidence: confidence,
      normalizedMerchant: normalized,
      amountCents: amount.cents,
      direction,
      status: confidence >= 75 && Boolean(date && amount.cents && normalized) ? "ready" : "review",
      reviewNote:
        confidence >= 75 && date && amount.cents && normalized
          ? null
          : "Please verify the date, merchant, and amount before importing.",
      fingerprint: fingerprint({ date, amountCents: amount.cents, normalizedMerchant: normalized, direction }),
    };

    rows.push(row);
  }

  return rows;
}

function getTesseractWorkerPath(): string {
  const directPath = path.resolve(
    process.cwd(),
    "node_modules",
    "tesseract.js",
    "src",
    "worker-script",
    "node",
    "index.js",
  );
  if (fs.existsSync(directPath)) {
    return directPath;
  }
  return directPath;
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

export async function parseImageBuffer(buffer: Buffer): Promise<ParsedImportRow[]> {
  const workerPath = getTesseractWorkerPath();
  const worker = await Tesseract.createWorker("eng", 1, {
    workerPath,
  });
  try {
    const ret = await worker.recognize(buffer);
    return parseStatementText(ret.data.text);
  } finally {
    await worker.terminate();
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
