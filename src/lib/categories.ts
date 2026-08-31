import { normalizeMerchant } from "@/lib/security";

export const CATEGORY_COLORS: Record<string, string> = {
  Food: "#f59e0b",
  Entertainment: "#8b5cf6",
  Income: "#10b981",
  Personal: "#ec4899",
  Driving: "#3b82f6",
  Housing: "#e11d48",
  Education: "#06b6d4",
  Transport: "#6366f1",
  Misc: "#64748b",
};

export type CategoryReference = {
  id: string;
  name: string;
  color?: string;
};

export type MerchantHistory = {
  normalizedMerchant: string;
  categoryId: string | null;
  categoryName?: string | null;
};

export type CategoryRuleReference = {
  pattern: string;
  categoryId: string;
  priority: number;
};

export type CategoryPrediction = {
  categoryId: string | null;
  categoryName: string | null;
  source: "historical" | "keyword" | "user-rule" | "none";
  confidence: "high" | "medium" | "low";
  reason: string;
};

const KEYWORD_RULES: Array<{ keywords: string[]; category: string }> = [
  {
    keywords: ["starbucks", "coffee", "cafe", "tea", "dunkin", "peets"],
    category: "Coffee",
  },
  {
    keywords: ["whole foods", "trader joe", "safeway", "kroger", "grocery", "market"],
    category: "Groceries",
  },
  {
    keywords: ["restaurant", "grill", "pizza", "sushi", "taco", "doordash", "ubereats"],
    category: "Dining",
  },
  {
    keywords: ["gas", "chevron", "shell", "exxon", "mobil", "parking", "toll", "fastrak", "valet", "car wash", "oil change", "auto repair", "driving"],
    category: "Driving",
  },
  {
    keywords: ["uber", "lyft", "transit", "metro", "subway", "train", "amtrak", "bus", "flight", "airline", "delta", "united", "american air", "transport", "transportation", "clipper", "mta"],
    category: "Transport",
  },
  {
    keywords: ["netflix", "spotify", "apple.com/bill", "hulu", "prime video", "subscription"],
    category: "Subscriptions",
  },
  {
    keywords: ["amazon", "target", "walmart", "costco", "ikea", "shopping"],
    category: "Shopping",
  },
  {
    keywords: ["movie", "cinema", "ticket", "concert", "bowling", "steam"],
    category: "Entertainment",
  },
  {
    keywords: ["rent", "mortgage", "property management", "landlord", "hoa", "apartment", "utilities", "electric", "water bill", "coned", "internet", "housing"],
    category: "Housing",
  },
  {
    keywords: ["electric", "water bill", "internet", "verizon", "at&t", "utility"],
    category: "Utilities",
  },
  {
    keywords: ["pharmacy", "doctor", "clinic", "dental", "health"],
    category: "Health",
  },
  {
    keywords: [
      "udemy",
      "coursera",
      "chegg",
      "edx",
      "masterclass",
      "tuition",
      "university",
      "college",
      "school",
      "course",
      "textbook",
      "audible",
      "duolingo",
      "education",
      "skillshare",
      "academy",
      "bookstore",
    ],
    category: "Education",
  },
  {
    keywords: [
      "payroll",
      "salary",
      "direct dep",
      "paycheck",
      "deposit",
      "bonus",
      "wage",
      "stipend",
      "dividend",
      "interest income",
      "reimbursement",
      "transfer in",
      "income",
    ],
    category: "Income",
  },
];

function categoryByName(categories: CategoryReference[], name: string) {
  return categories.find((category) => category.name.toLocaleLowerCase() === name.toLocaleLowerCase());
}

export function predictCategory(
  merchant: string,
  categories: CategoryReference[],
  history: MerchantHistory[],
  rules: CategoryRuleReference[],
): CategoryPrediction {
  const normalized = normalizeMerchant(merchant);
  if (!normalized) {
    return {
      categoryId: null,
      categoryName: null,
      source: "none",
      confidence: "low",
      reason: "Enter a merchant name to get a suggestion.",
    };
  }

  const historicalMatches = history.filter(
    (item) => item.normalizedMerchant === normalized && item.categoryId,
  );
  if (historicalMatches.length > 0) {
    const counts = new Map<string, number>();
    for (const match of historicalMatches) {
      counts.set(match.categoryId as string, (counts.get(match.categoryId as string) ?? 0) + 1);
    }
    const [categoryId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const category = categories.find((item) => item.id === categoryId);
    if (category) {
      return {
        categoryId: category.id,
        categoryName: category.name,
        source: "historical",
        confidence: historicalMatches.length > 1 ? "high" : "medium",
        reason: "Matches a category you have used for this merchant.",
      };
    }
  }

  for (const keywordRule of KEYWORD_RULES) {
    const matches = keywordRule.keywords.some((keyword) =>
      normalized.includes(normalizeMerchant(keyword)),
    );
    if (matches) {
      const category = categoryByName(categories, keywordRule.category);
      if (category) {
        return {
          categoryId: category.id,
          categoryName: category.name,
          source: "keyword",
          confidence: "medium",
          reason: `Matched the built-in ${keywordRule.category.toLocaleLowerCase()} pattern.`,
        };
      }
    }
  }

  const matchingRule = [...rules]
    .sort((a, b) => b.priority - a.priority)
    .find((rule) => normalized.includes(normalizeMerchant(rule.pattern)));
  if (matchingRule) {
    const category = categories.find((item) => item.id === matchingRule.categoryId);
    if (category) {
      return {
        categoryId: category.id,
        categoryName: category.name,
        source: "user-rule",
        confidence: "medium",
        reason: "Matched one of your category rules.",
      };
    }
  }

  return {
    categoryId: null,
    categoryName: null,
    source: "none",
    confidence: "low",
    reason: "No confident category match yet.",
  };
}

export { KEYWORD_RULES };
