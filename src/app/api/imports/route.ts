import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { detectInBatch, parsePdfBuffer, parseStatementText, PARSER_VERSION, type ParsedImportRow } from "@/lib/importer";

export const runtime = "nodejs";

function serializeBatch(batch: {
  id: string;
  sourceFilename: string;
  sourceAccount: string | null;
  statementPeriodStart: Date | null;
  statementPeriodEnd: Date | null;
  parserVersion: string;
  status: string;
  totalRows: number;
  parsedRows: number;
  reviewRows: number;
  duplicateRows: number;
  createdAt: Date;
  committedAt: Date | null;
}) {
  return {
    ...batch,
    statementPeriodStart: batch.statementPeriodStart?.toISOString() ?? null,
    statementPeriodEnd: batch.statementPeriodEnd?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    committedAt: batch.committedAt?.toISOString() ?? null,
  };
}

function rowDateKey(date: Date | null) {
  return date?.toISOString().slice(0, 10) ?? null;
}

async function annotateDuplicates(rows: ParsedImportRow[]) {
  const existing = await prisma.transaction.findMany({
    select: { date: true, amountCents: true, normalizedMerchant: true, direction: true },
  });
  const exact = new Set(
    existing.map((transaction) =>
      [
        rowDateKey(transaction.date),
        transaction.amountCents,
        transaction.normalizedMerchant,
        transaction.direction,
      ].join("|"),
    ),
  );
  return rows.map((row) => {
    const key = [
      rowDateKey(row.date),
      row.amountCents,
      row.normalizedMerchant,
      row.direction,
    ].join("|");
    const possible = existing.some(
      (transaction) =>
        rowDateKey(transaction.date) === rowDateKey(row.date) &&
        transaction.amountCents === row.amountCents,
    );
    if (exact.has(key)) {
      return {
        ...row,
        status: "review" as const,
        duplicateKind: "exact",
        reviewNote: "An identical transaction already exists.",
      };
    }
    if (possible) {
      return {
        ...row,
        status: "review" as const,
        duplicateKind: "probable",
        reviewNote: "A transaction with the same date and amount already exists. Confirm it is distinct.",
      };
    }
    return { ...row, duplicateKind: null };
  });
}

function importRowData(row: ParsedImportRow) {
  return {
    date: row.date,
    merchantRaw: row.merchantRaw || "Needs review",
    amountRaw: row.amountRaw,
    transactionTypeRaw: row.transactionTypeRaw,
    sourcePage: row.sourcePage,
    parsedConfidence: row.parsedConfidence,
    normalizedMerchant: row.normalizedMerchant,
    amountCents: row.amountCents,
    direction: row.direction,
    status: row.status,
    reviewNote: row.reviewNote,
  };
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const batches = await prisma.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return jsonOk(batches.map(serializeBatch));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonError("Choose a PDF or text statement first.", 422);
    }
    if (file.size > 20 * 1024 * 1024) {
      return jsonError("Statement files must be smaller than 20 MB.", 413);
    }

    const extension = file.name.toLocaleLowerCase("en-US").split(".").pop();
    if (extension !== "pdf" && extension !== "txt") {
      return jsonError("Only PDF and text statement files are supported.", 415);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = extension === "pdf" ? await parsePdfBuffer(buffer) : parseStatementText(buffer.toString("utf8"));
    const rows = await annotateDuplicates(detectInBatch(parsed));
    if (!rows.length) {
      return jsonError("No transaction rows were detected. This may be a scanned PDF or an unsupported statement layout.", 422);
    }
    const dates = rows.map((row) => row.date?.getTime()).filter((value): value is number => value !== undefined);
    const parsedRows = rows.filter((row) => row.status === "ready").length;
    const duplicateRows = rows.filter((row) => row.duplicateKind).length;
    const batch = await prisma.importBatch.create({
      data: {
        sourceFilename: file.name.slice(0, 255),
        parserVersion: PARSER_VERSION,
        status: "review",
        totalRows: rows.length,
        parsedRows,
        reviewRows: rows.length - parsedRows,
        duplicateRows,
        statementPeriodStart: dates.length ? new Date(Math.min(...dates)) : null,
        statementPeriodEnd: dates.length ? new Date(Math.max(...dates)) : null,
        importedTransactions: {
          create: rows.map(importRowData),
        },
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "create",
        entityType: "import_batch",
        entityId: batch.id,
        details: JSON.stringify({ sourceFilename: file.name, rows: rows.length }),
      },
    });

    return jsonOk(serializeBatch(batch), 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
