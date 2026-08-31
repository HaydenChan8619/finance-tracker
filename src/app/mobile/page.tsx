"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ClientApiError } from "@/lib/client";
import { parseAmountToCents } from "@/lib/validation";
import { Icon } from "@/components/icon";

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
    const idempotencyKey = crypto.randomUUID();
    const payload = {
      merchant: merchant.trim(),
      amountCents,
      direction: "expense",
      date: new Date().toISOString(),
      categoryId: selectedCategory?.id ?? null,
      isSocial,
      isDating,
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

  const targetCategories = ["Food", "Entertainment", "Clothing", "Personal Care", "Driving", "Misc"];

  // Prepare ordered categories list matching the target categories
  const displayCategories = targetCategories.map((name) => {
    const found = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    return found ?? { id: name, name, color: "#2a6f68" };
  });

  return (
    <main className="mobile-modal-layout">
      <header className="mobile-simple-header">
        <Link href="/dashboard" className="brand" aria-label="Finance Tracker">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Finance Tracker</span>
        </Link>
        <div className="mobile-header-actions">
          <Link href="/dashboard" className="button button-secondary button-sm">
            <Icon name="chart" className="icon-sm" />
            Dashboard
          </Link>
          <Link href="/transactions" className="button button-secondary button-sm">
            <Icon name="book" className="icon-sm" />
            Ledger
          </Link>
        </div>
      </header>

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
              placeholder="What or where did you pay?"
              autoComplete="off"
              autoFocus
              required
            />
          </div>

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
            <label>Category</label>
            <div className="category-btn-grid" role="radiogroup" aria-label="Category selection">
              {displayCategories.map((category) => {
                const isSelected = categoryId === category.id;
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
                    <span>{category.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="tag-toggle-group">
            <button
              className={`tag-toggle-pill${isSocial ? " tag-toggle-active-social" : ""}`}
              type="button"
              onClick={() => setIsSocial((prev) => !prev)}
              aria-pressed={isSocial}
            >
              <Icon name="users" className="icon-sm" />
              <span>Social</span>
            </button>

            <button
              className={`tag-toggle-pill${isDating ? " tag-toggle-active-dating" : ""}`}
              type="button"
              onClick={() => setIsDating((prev) => !prev)}
              aria-pressed={isDating}
            >
              <Icon name="spark" className="icon-sm" />
              <span>Dating</span>
            </button>
          </div>

          {error ? <div className="form-error" role="alert">{error}</div> : null}
          {message ? <div className="form-success" role="status">{message}</div> : null}

          <button className="button button-primary capture-submit-btn" type="submit" disabled={saving || !authorized}>
            <Icon name="check" className="icon-sm" />
            {saving ? "Saving…" : "Save Expense"}
          </button>
        </form>
      </div>
    </main>
  );
}
