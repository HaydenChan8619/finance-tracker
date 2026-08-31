"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ClientApiError, formatMoney, shortDate } from "@/lib/client";
import { parseAmountToCents } from "@/lib/validation";
import AppShell from "@/components/app-shell";
import { Icon } from "@/components/icon";

type Category = { id: string; name: string; color: string };
type Prediction = {
  categoryId: string | null;
  categoryName: string | null;
  source: "historical" | "keyword" | "user-rule" | "none";
  reason: string;
};
type RecentTransaction = {
  id: string;
  merchant: string;
  amountCents: number;
  direction: string;
  date: string;
  category: Category | null;
  isSocial: boolean;
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
  const [recent, setRecent] = useState<RecentTransaction[]>([]);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [isSocial, setIsSocial] = useState(false);
  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(true);
  const [authorized, setAuthorized] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const predictionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryTouched = useRef(false);

  const loadRecent = useCallback(async () => {
    try {
      const [categoryData, recentData] = await Promise.all([
        apiFetch<Category[]>("/api/categories"),
        apiFetch<RecentTransaction[]>("/api/mobile/recent"),
      ]);
      setCategories(categoryData);
      setRecent(recentData);
      const cache = readCategoryCache();
      for (const transaction of recentData) {
        if (transaction.category) {
          cache[normalizeClientMerchant(transaction.merchant)] = {
            categoryId: transaction.category.id,
            categoryName: transaction.category.name,
          };
        }
      }
      writeCategoryCache(cache);
      setAuthorized(true);
    } catch (requestError) {
      if (requestError instanceof ClientApiError && (requestError.status === 401 || requestError.status === 403)) {
        setAuthorized(false);
        setError("This capture surface needs an enrolled device or an admin session.");
      } else {
        setError(requestError instanceof Error ? requestError.message : "Unable to load recent transactions.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const flushPending = useCallback(async () => {
    const current = readPending();
    if (!current.length || !navigator.onLine) return;
    const remaining: PendingTransaction[] = [];
    for (const item of current) {
      try {
        await apiFetch("/api/transactions", { method: "POST", body: JSON.stringify(item.payload) });
      } catch {
        remaining.push(item);
      }
    }
    writePending(remaining);
    setPending(remaining);
    if (remaining.length !== current.length) {
      setMessage(`${current.length - remaining.length} pending transaction${current.length - remaining.length === 1 ? "" : "s"} synced.`);
      void loadRecent();
    }
  }, [loadRecent]);

  useEffect(() => {
    setPending(readPending());
    setOnline(navigator.onLine);
    void loadRecent();
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
  }, [flushPending, loadRecent]);

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
        reason: "Matched your on-device category cache.",
      });
      setCategoryId(cached.categoryId);
    }
    predictionTimer.current = setTimeout(() => {
      void apiFetch<{ prediction: Prediction }>(`/api/predictions?merchant=${encodeURIComponent(merchant)}`)
        .then((data) => {
          setPrediction(data.prediction);
          if (!categoryTouched.current) {
            setCategoryId(data.prediction.categoryId || "");
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
    setPending(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const amountCents = parseAmountToCents(amount);
    if (!amountCents) {
      setError("Enter a valid positive amount, such as 7.42.");
      return;
    }
    const selectedCategory = categories.find((category) => category.id === categoryId);
    const idempotencyKey = crypto.randomUUID();
    const payload = {
      merchant,
      amountCents,
      direction: "expense",
      date: new Date().toISOString(),
      categoryId: selectedCategory?.id ?? null,
      isSocial,
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
          body: JSON.stringify({ merchant, categoryId: selectedCategory.id }),
        }).catch(() => undefined);
      }
      setMerchant("");
      setAmount("");
      setCategoryId("");
      setPrediction(null);
      setIsSocial(false);
      if (selectedCategory) {
        const cache = readCategoryCache();
        cache[normalizeClientMerchant(merchant)] = { categoryId: selectedCategory.id, categoryName: selectedCategory.name };
        writeCategoryCache(cache);
      }
      setMessage("Saved to your private ledger.");
      await loadRecent();
    } catch (requestError) {
      if (!(requestError instanceof ClientApiError)) {
        await queueForLater(payload, idempotencyKey);
        setMerchant("");
        setAmount("");
        setCategoryId("");
        setPrediction(null);
        setIsSocial(false);
        setMessage("Saved on this phone. It will sync when the connection returns.");
      } else {
        setError(requestError instanceof Error ? requestError.message : "Unable to save this transaction.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Quick capture"
      description="A few seconds now keeps the full picture honest later."
      actions={<Link className="button button-secondary" href="/dashboard"><Icon name="chart" className="icon-sm" />View dashboard</Link>}
    >
      {!authorized ? (
        <div className="form-notice" role="status" style={{ marginBottom: 18 }}>
          <strong>Device authorization required.</strong> Generate an enrollment code from the admin Settings page, then open that link on this phone. <Link href="/login">Admin sign in</Link>
        </div>
      ) : null}
      {!online ? <div className="form-notice" role="status" style={{ marginBottom: 18 }}>Offline — new entries will wait on this phone and retry safely later.</div> : null}
      <div className="mobile-capture">
        <section className="surface capture-panel" aria-labelledby="capture-title">
          <p className="eyebrow">The shortest route</p>
          <h2 id="capture-title">What did you spend?</h2>
          <p>Name it, price it, and let the ledger do the sorting.</p>
          <form className="capture-form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="capture-merchant">Name</label>
              <input id="capture-merchant" className="input" value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder="Coffee, train, market…" autoComplete="off" required />
            </div>
            <div className="field">
              <label htmlFor="capture-amount">Amount</label>
              <div className="amount-field"><span className="amount-prefix">$</span><input id="capture-amount" className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></div>
            </div>
            <div className="field">
              <label htmlFor="capture-category">Category</label>
              <select id="capture-category" className="select" value={categoryId} onChange={(event) => { categoryTouched.current = true; setCategoryId(event.target.value); }} disabled={loading}>
                <option value="">Choose or leave uncategorized</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <p className="prediction-note">
                <Icon name="spark" className="icon-sm" />
                {prediction ? <span><strong>{prediction.categoryName}</strong> · {prediction.reason}</span> : "Category suggestions appear as you type."}
              </p>
            </div>
            <button className={`social-toggle${isSocial ? " social-toggle-active" : ""}`} type="button" onClick={() => setIsSocial((current) => !current)} aria-pressed={isSocial}>
              <span className="toggle-copy"><strong>Social spend</strong><span>Keep this separate from the category.</span></span>
              <span className="toggle-switch" aria-hidden="true" />
            </button>
            {error ? <div className="form-error" role="alert">{error}</div> : null}
            {message ? <div className="form-success" role="status">{message}</div> : null}
            <button className="button button-primary" type="submit" disabled={saving || !authorized}>
              <Icon name="check" className="icon-sm" />
              {saving ? "Saving…" : "Save expense"}
            </button>
          </form>
        </section>

        <aside className="capture-side">
          <section className="surface">
            <div className="surface-header"><div><h3>Waiting to sync</h3><p>Retry-safe entries held locally.</p></div><Icon name="refresh" className="icon-lg" /></div>
            <div className="surface-body">
              {pending.length ? <div className="insight-list">{pending.map((item) => <div className="insight-row" key={item.idempotencyKey}><span className="insight-label"><strong>{String(item.payload.merchant)}</strong><span>pending since {shortDate(item.createdAt)}</span></span><span className="status-badge status-review">queued</span></div>)}</div> : <div className="empty-state"><div><strong>Nothing waiting.</strong><p>Offline entries will appear here until the server confirms them.</p></div></div>}
            </div>
          </section>
          <section className="surface">
            <div className="surface-header"><div><h3>Recent stations</h3><p>Only the latest rows are shown here.</p></div><Icon name="book" className="icon-lg" /></div>
            <div className="surface-body">
              {recent.length ? <div className="insight-list">{recent.slice(0, 6).map((transaction) => <div className="insight-row" key={transaction.id}><span className="insight-label"><strong>{transaction.merchant}</strong><span>{shortDate(transaction.date)} · {transaction.category?.name ?? "Uncategorized"}{transaction.isSocial ? " · social" : ""}</span></span><span className="insight-value">{formatMoney(transaction.amountCents, transaction.direction)}</span></div>)}</div> : <div className="empty-state"><div><strong>Your recent line is quiet.</strong><p>Save an expense and it will appear here.</p></div></div>}
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
