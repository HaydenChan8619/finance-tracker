import { prisma } from "@/lib/prisma";
import { CATEGORY_COLORS } from "@/lib/categories";

type TransactionWithCategory = Awaited<
  ReturnType<typeof prisma.transaction.findMany<{ include: { category: true } }>>
>[number];

export type MonthCategoryExpense = {
  id: string;
  name: string;
  color: string;
  amountCents: number;
};

export type MonthBucket = {
  key: string;
  label: string;
  income: number;
  expenses: number;
  social: number;
  expensesByCategory: MonthCategoryExpense[];
};

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function findRecurring(transactions: TransactionWithCategory[]) {
  const merchantGroups = new Map<string, TransactionWithCategory[]>();

  for (const transaction of transactions) {
    if (transaction.direction !== "expense") {
      continue;
    }
    const group = merchantGroups.get(transaction.normalizedMerchant) ?? [];
    group.push(transaction);
    merchantGroups.set(transaction.normalizedMerchant, group);
  }

  return [...merchantGroups.entries()]
    .flatMap(([, group]) => {
      if (group.length < 2) {
        return [];
      }

      const ordered = [...group].sort((a, b) => a.date.getTime() - b.date.getTime());
      const intervals = ordered.slice(1).map((transaction, index) => {
        return Math.round(
          (transaction.date.getTime() - ordered[index].date.getTime()) / (1000 * 60 * 60 * 24),
        );
      });
      const averageInterval = average(intervals);
      const amount = average(ordered.map((transaction) => transaction.amountCents));
      const amountSpread = Math.max(...ordered.map((transaction) => transaction.amountCents)) -
        Math.min(...ordered.map((transaction) => transaction.amountCents));
      const likelyRegular = averageInterval >= 5 && averageInterval <= 45 && amountSpread <= amount * 0.25;

      if (!likelyRegular) {
        return [];
      }

      return [
        {
          merchant: ordered[0].merchant,
          amountCents: amount,
          cadenceDays: averageInterval,
          occurrences: ordered.length,
          lastDate: ordered[ordered.length - 1].date.toISOString(),
          category: ordered[0].category?.name ?? "Uncategorized",
        },
      ];
    })
    .sort((a, b) => b.occurrences - a.occurrences || b.amountCents - a.amountCents)
    .slice(0, 8);
}

export async function getAnalytics() {
  const now = new Date();
  const currentMonth = monthStart(now);
  const twelveMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const transactions = await prisma.transaction.findMany({
    where: { date: { gte: twelveMonthsAgo, lte: now } },
    include: { category: true },
    orderBy: { date: "desc" },
  });

  const months: MonthBucket[] = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - index), 1));
    return {
      key: monthKey(date),
      label: monthLabel(date),
      income: 0,
      expenses: 0,
      social: 0,
      expensesByCategory: [],
    };
  });
  const monthLookup = new Map(months.map((month) => [month.key, month]));
  const monthCategoryMap = new Map<string, Map<string, MonthCategoryExpense>>();
  for (const month of months) {
    monthCategoryMap.set(month.key, new Map());
  }

  const categoryTotals = new Map<string, { name: string; color: string; amountCents: number }>();
  const socialCategoryTotals = new Map<string, { name: string; color: string; amountCents: number }>();
  const merchantTotals = new Map<string, { merchant: string; amountCents: number; count: number }>();
  const socialMerchantTotals = new Map<string, { merchant: string; amountCents: number; count: number }>();
  let totalIncome = 0;
  let totalExpenses = 0;
  let socialExpenses = 0;

  for (const transaction of transactions) {
    const mKey = monthKey(transaction.date);
    const bucket = monthLookup.get(mKey);
    if (transaction.direction === "income") {
      totalIncome += transaction.amountCents;
      if (bucket) {
        bucket.income += transaction.amountCents;
      }
      continue;
    }

    totalExpenses += transaction.amountCents;
    if (transaction.isSocial) {
      socialExpenses += transaction.amountCents;
      if (bucket) {
        bucket.social += transaction.amountCents;
      }
    }
    if (bucket) {
      bucket.expenses += transaction.amountCents;
    }

    const categoryKey = transaction.category?.id ?? "uncategorized";
    const categoryName = transaction.category?.name ?? "Misc";
    const categoryColor = transaction.category?.color || CATEGORY_COLORS[categoryName] || "#64748b";

    const catMap = monthCategoryMap.get(mKey);
    if (catMap) {
      const existing = catMap.get(categoryKey) ?? {
        id: categoryKey,
        name: categoryName,
        color: categoryColor,
        amountCents: 0,
      };
      existing.amountCents += transaction.amountCents;
      catMap.set(categoryKey, existing);
    }

    const category = categoryTotals.get(categoryKey) ?? {
      name: categoryName,
      color: categoryColor,
      amountCents: 0,
    };
    category.amountCents += transaction.amountCents;
    categoryTotals.set(categoryKey, category);

    if (transaction.isSocial) {
      const socialCategory = socialCategoryTotals.get(categoryKey) ?? {
        name: categoryName,
        color: categoryColor,
        amountCents: 0,
      };
      socialCategory.amountCents += transaction.amountCents;
      socialCategoryTotals.set(categoryKey, socialCategory);
    }

    const merchant = merchantTotals.get(transaction.normalizedMerchant) ?? {
      merchant: transaction.merchant,
      amountCents: 0,
      count: 0,
    };
    merchant.amountCents += transaction.amountCents;
    merchant.count += 1;
    merchantTotals.set(transaction.normalizedMerchant, merchant);

    if (transaction.isSocial) {
      const socialMerchant = socialMerchantTotals.get(transaction.normalizedMerchant) ?? {
        merchant: transaction.merchant,
        amountCents: 0,
        count: 0,
      };
      socialMerchant.amountCents += transaction.amountCents;
      socialMerchant.count += 1;
      socialMerchantTotals.set(transaction.normalizedMerchant, socialMerchant);
    }
  }

  for (const month of months) {
    const catMap = monthCategoryMap.get(month.key);
    month.expensesByCategory = catMap
      ? [...catMap.values()].sort((a, b) => b.amountCents - a.amountCents)
      : [];
  }

  const latestMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];
  const monthOverMonth =
    previousMonth.expenses === 0
      ? null
      : Math.round(((latestMonth.expenses - previousMonth.expenses) / previousMonth.expenses) * 100);

  return {
    period: {
      from: twelveMonthsAgo.toISOString(),
      to: now.toISOString(),
      currentMonth: currentMonth.toISOString(),
    },
    totals: {
      totalIncome,
      totalExpenses,
      net: totalIncome - totalExpenses,
      socialExpenses,
      monthOverMonth,
      socialPercentage: totalExpenses ? Math.round((socialExpenses / totalExpenses) * 100) : 0,
    },
    months,
    categoryBreakdown: [...categoryTotals.values()]
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 10),
    socialByCategory: [...socialCategoryTotals.values()]
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 8),
    topMerchants: [...merchantTotals.values()]
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 8),
    socialTopMerchants: [...socialMerchantTotals.values()]
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 8),
    recurring: findRecurring(transactions),
  };
}
