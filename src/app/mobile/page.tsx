"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/app-shell";
import { apiFetch, ClientApiError } from "@/lib/client";
import { parseAmountToCents } from "@/lib/validation";
import {
  Utensils,
  Clapperboard,
  ArrowUpRight,
  User,
  Car,
  Shapes,
  Users,
  Heart,
  Home,
  Bus,
  Check,
  BookOpen,
  Tag,
  Calendar,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_COLORS } from "@/lib/categories";

const targetCategories = [
  "Food",
  "Entertainment",
  "Driving",
  "Personal",
  "Education",
  "Housing",
  "Transport",
  "Income",
  "Misc",
];

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const categoryIcons: Record<string, LucideIcon> = {
  food: Utensils,
  entertainment: Clapperboard,
  income: ArrowUpRight,
  personal: User,
  driving: Car,
  housing: Home,
  education: BookOpen,
  transport: Bus,
  misc: Shapes,
};

function getCategoryIcon(name: string): LucideIcon {
  return categoryIcons[name.toLowerCase().trim()] ?? Tag;
}

type Category = { id: string; name: string; color: string };
type Prediction = {
  categoryId: string | null;
  categoryName: string | null;
  source: "historical" | "keyword" | "user-rule" | "none";
  reason: string;
};
type PendingTransaction = {
  idempotencyKey: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

const pendingStorageKey = "finance-tracker-pending-transactions";
const categoryCacheKey = "finance-tracker-category-cache";

function normalizeClientMerchant(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function readCategoryCache() {
  if (typeof window === "undefined") return {} as Record<string, { categoryId: string; categoryName: string }>;
  try {
    return JSON.parse(localStorage.getItem(categoryCacheKey) ?? "{}") as Record<string, { categoryId: string; categoryName: string }>;
  } catch {
    return {};
  }
}

function writeCategoryCache(items: Record<string, { categoryId: string; categoryName: string }>) {
  localStorage.setItem(categoryCacheKey, JSON.stringify(items));
}

function readPending() {
  if (typeof window === "undefined") return [] as PendingTransaction[];
  try {
    return JSON.parse(localStorage.getItem(pendingStorageKey) ?? "[]") as PendingTransaction[];
  } catch {
    return [];
  }
}

function writePending(items: PendingTransaction[]) {
  localStorage.setItem(pendingStorageKey, JSON.stringify(items));
}

export default function MobilePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getTodayString);
  const [categoryId, setCategoryId] = useState("");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [isSocial, setIsSocial] = useState(false);
  const [isDating, setIsDating] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(true);
  const [authorized, setAuthorized] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const predictionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryTouched = useRef(false);
  const merchantInputRef = useRef<HTMLInputElement | null>(null);
  const datePickerRef = useRef<HTMLInputElement | null>(null);

  function openCalendar() {
    if (datePickerRef.current) {
      if ("showPicker" in HTMLInputElement.prototype) {
        try {
          datePickerRef.current.showPicker();
          return;
        } catch {
          // ignore error and fallback
        }
      }
      datePickerRef.current.focus();
      datePickerRef.current.click();
    }
  }

  const loadCategories = useCallback(async () => {
    try {
      const categoryData = await apiFetch<Category[]>("/api/categories");
      setCategories(categoryData);
      setAuthorized(true);
    } catch (requestError) {
      if (requestError instanceof ClientApiError && (requestError.status === 401 || requestError.status === 403)) {
        setAuthorized(false);
        setError("Authorization required. Generate an enrollment code in Settings.");
      } else {
        setError(requestError instanceof Error ? requestError.message : "Unable to load categories.");
      }
    }
  }, []);

  const flushPending = useCallback(async () => {
    const current = readPending();
    if (!current.length || !navigator.onLine) {
      setPendingCount(current.length);
      return;
    }
    const remaining: PendingTransaction[] = [];
    for (const item of current) {
      try {
        await apiFetch("/api/transactions", { method: "POST", body: JSON.stringify(item.payload) });
      } catch {
        remaining.push(item);
      }
    }
    writePending(remaining);
    setPendingCount(remaining.length);
    if (remaining.length !== current.length) {
      setMessage(`${current.length - remaining.length} offline entry synced.`);
    }
  }, []);

  useEffect(() => {
    setPendingCount(readPending().length);
    setOnline(navigator.onLine);
    void loadCategories();
    void flushPending();
    const becameOnline = () => {
      setOnline(true);
      void flushPending();
    };
    const becameOffline = () => setOnline(false);
    window.addEventListener("online", becameOnline);
    window.addEventListener("offline", becameOffline);
    return () => {
      window.removeEventListener("online", becameOnline);
      window.removeEventListener("offline", becameOffline);
    };
  }, [flushPending, loadCategories]);

  useEffect(() => {
    if (predictionTimer.current) clearTimeout(predictionTimer.current);
    categoryTouched.current = false;
    if (!merchant.trim()) {
      setPrediction(null);
      setCategoryId("");
      return;
    }
    setCategoryId("");
    const cached = readCategoryCache()[normalizeClientMerchant(merchant)];
    if (cached) {
      setPrediction({
        categoryId: cached.categoryId,
        categoryName: cached.categoryName,
        source: "historical",
        reason: "Matched category cache",
      });
      setCategoryId(cached.categoryId);
    }
    predictionTimer.current = setTimeout(() => {
      void apiFetch<{ prediction: Prediction }>(`/api/predictions?merchant=${encodeURIComponent(merchant)}`)
        .then((data) => {
          setPrediction(data.prediction);
          if (!categoryTouched.current && data.prediction.categoryId) {
            setCategoryId(data.prediction.categoryId);
          }
        })
        .catch(() => undefined);
    }, 180);
    return () => {
      if (predictionTimer.current) clearTimeout(predictionTimer.current);
    };
  }, [merchant]);

  function queueForLater(payload: Record<string, unknown>, idempotencyKey: string) {
    const next = [...readPending(), { idempotencyKey, payload, createdAt: new Date().toISOString() }];
    writePending(next);
    setPendingCount(next.length);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const amountCents = parseAmountToCents(amount);
    if (!amountCents) {
      setError("Enter a valid amount (e.g. 12.50).");
      return;
    }
    const selectedCategory = categories.find((category) => category.id === categoryId);
    const isIncome = selectedCategory?.name.toLowerCase() === "income" || categoryId === "Income";
    const miscCategory = categories.find((c) => c.name.toLowerCase() === "misc");
    const finalCategoryId = selectedCategory ? selectedCategory.id : (miscCategory?.id ?? null);
    const direction = isIncome ? "income" : "expense";

    const idempotencyKey = crypto.randomUUID();
    let transactionDate = new Date();
    if (date && date.trim()) {
      const trimmed = date.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [y, m, d] = trimmed.split("-").map(Number);
        transactionDate = new Date(y, m - 1, d, 12, 0, 0);
      } else {
        const candidate = new Date(trimmed);
        if (!isNaN(candidate.getTime())) {
          transactionDate = candidate;
        }
      }
    }

    const payload = {
      merchant: merchant.trim(),
      amountCents,
      direction,
      date: transactionDate.toISOString(),
      categoryId: finalCategoryId,
      isSocial: isIncome ? false : isSocial,
      isDating: isIncome ? false : isDating,
      source: "mobile",
      predictionSource: prediction?.source ?? null,
      idempotencyKey,
    };

    setSaving(true);
    try {
      await apiFetch("/api/transactions", { method: "POST", body: JSON.stringify(payload) });
      if (prediction && selectedCategory && prediction.categoryId !== selectedCategory.id) {
        void apiFetch("/api/predictions", {
          method: "POST",
          body: JSON.stringify({ merchant: merchant.trim(), categoryId: selectedCategory.id }),
        }).catch(() => undefined);
      }
      if (selectedCategory) {
        const cache = readCategoryCache();
        cache[normalizeClientMerchant(merchant)] = { categoryId: selectedCategory.id, categoryName: selectedCategory.name };
        writeCategoryCache(cache);
      }
      setMerchant("");
      setAmount("");
      setDate(getTodayString());
      setCategoryId("");
      setPrediction(null);
      setIsSocial(false);
      setIsDating(false);
      setMessage("Saved!");
      setTimeout(() => setMessage(""), 3000);
      merchantInputRef.current?.focus();
    } catch (requestError) {
      if (!(requestError instanceof ClientApiError)) {
        queueForLater(payload, idempotencyKey);
        setMerchant("");
        setAmount("");
        setDate(getTodayString());
        setCategoryId("");
        setPrediction(null);
        setIsSocial(false);
        setIsDating(false);
        setMessage("Saved offline. Will sync automatically.");
        setTimeout(() => setMessage(""), 4000);
      } else {
        setError(requestError instanceof Error ? requestError.message : "Unable to save transaction.");
      }
    } finally {
      setSaving(false);
    }
  }

  // Prepare ordered categories list matching target categories, plus any extra custom categories
  const displayCategories = useMemo(() => {
    const seen = new Set<string>();
    const result: Category[] = [];
    for (const name of targetCategories) {
      const found = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (found) {
        result.push(found);
        seen.add(found.id);
      } else {
        result.push({ id: name, name, color: CATEGORY_COLORS[name] || "#64748b" });
      }
    }
    for (const c of categories) {
      if (!seen.has(c.id)) {
        result.push(c);
      }
    }
    return result;
  }, [categories]);

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isIncomeSelected = selectedCategory?.name.toLowerCase() === "income" || categoryId === "Income";

  return (
    <AppShell
      title="Add"
      actions={
        <Link href="/transactions" className="button button-secondary button-sm">
          <BookOpen className="icon-sm" />
          Ledger
        </Link>
      }
    >
      <div className="mobile-capture-container">
        <div className="mobile-modal-card surface">
          {!authorized ? (
            <div className="form-notice" role="status" style={{ marginBottom: 16 }}>
              <strong>Authorization required.</strong> Generate an enrollment code in Settings. <Link href="/login">Admin sign in</Link>
            </div>
          ) : null}

          {!online ? (
            <div className="form-notice" role="status" style={{ marginBottom: 16 }}>
              Offline mode — will sync when connected.
            </div>
          ) : pendingCount > 0 ? (
            <div className="form-notice" role="status" style={{ marginBottom: 16 }}>
              {pendingCount} offline {pendingCount === 1 ? "entry" : "entries"} pending sync.
            </div>
          ) : null}

          <form className="capture-form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="capture-merchant">Merchant / Description</label>
              <input
                id="capture-merchant"
                ref={merchantInputRef}
                className="input"
                value={merchant}
                onChange={(event) => setMerchant(event.target.value)}
                placeholder="What or where did you pay / earn?"
                autoComplete="off"
                autoFocus
                required
              />
            </div>

            <div className="form-row-2col">
              <div className="field">
                <label htmlFor="capture-amount">Amount</label>
                <div className="amount-field">
                  <span className="amount-prefix">$</span>
                  <input
                    id="capture-amount"
                    className="input amount-input-lg"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="capture-date">Date</label>
                <div className="date-input-group">
                  <input
                    id="capture-date"
                    type="text"
                    className="input date-text-input"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    placeholder="YYYY-MM-DD"
                    required
                  />
                  <button
                    type="button"
                    className="date-calendar-btn"
                    onClick={openCalendar}
                    aria-label="Pick date from calendar"
                    title="Pick date from calendar"
                  >
                    <Calendar className="icon-sm" />
                  </button>
                  <input
                    ref={datePickerRef}
                    type="date"
                    className="date-picker-native"
                    value={/^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? date.trim() : getTodayString()}
                    onChange={(event) => {
                      if (event.target.value) {
                        setDate(event.target.value);
                      }
                    }}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>

            <div className="field">
              <label>Category <span className="muted" style={{ textTransform: "none", fontWeight: 400 }}>(defaults to Misc if none chosen)</span></label>
              <div className="category-btn-grid" role="radiogroup" aria-label="Category selection">
                {displayCategories.map((category) => {
                  const isSelected = categoryId === category.id;
                  const CategoryIcon = getCategoryIcon(category.name);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      className={`category-select-btn${isSelected ? " category-select-btn-active" : ""}`}
                      onClick={() => {
                        categoryTouched.current = true;
                        setCategoryId(isSelected ? "" : category.id);
                      }}
                      role="radio"
                      aria-checked={isSelected}
                    >
                      <CategoryIcon className="icon-sm" />
                      <span>{category.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {!isIncomeSelected ? (
              <div className="tag-toggle-group">
                <button
                  className={`tag-toggle-pill${isSocial ? " tag-toggle-active-social" : ""}`}
                  type="button"
                  onClick={() => setIsSocial((prev) => !prev)}
                  aria-pressed={isSocial}
                >
                  <Users className="icon-sm" />
                  <span>Social</span>
                </button>

                <button
                  className={`tag-toggle-pill${isDating ? " tag-toggle-active-dating" : ""}`}
                  type="button"
                  onClick={() => setIsDating((prev) => !prev)}
                  aria-pressed={isDating}
                >
                  <Heart className="icon-sm" />
                  <span>Dating</span>
                </button>
              </div>
            ) : null}

            {error ? <div className="form-error" role="alert">{error}</div> : null}
            {message ? <div className="form-success" role="status">{message}</div> : null}

            <button className="button button-primary capture-submit-btn" type="submit" disabled={saving || !authorized}>
              <Check className="icon-sm" />
              {saving ? "Saving…" : isIncomeSelected ? "Save Income" : "Save Expense"}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
