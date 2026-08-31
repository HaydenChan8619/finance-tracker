export function serializeTransaction(transaction: {
  id: string;
  merchant: string;
  amountCents: number;
  direction: string;
  date: Date;
  isSocial: boolean;
  notes: string | null;
  source: string;
  predictionSource: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string; color: string } | null;
}) {
  return {
    id: transaction.id,
    merchant: transaction.merchant,
    amountCents: transaction.amountCents,
    direction: transaction.direction,
    date: transaction.date.toISOString(),
    category: transaction.category,
    isSocial: transaction.isSocial,
    notes: transaction.notes,
    source: transaction.source,
    predictionSource: transaction.predictionSource,
    idempotencyKey: transaction.idempotencyKey,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}
