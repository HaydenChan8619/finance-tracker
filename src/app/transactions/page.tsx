"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import AuthGate from "@/components/auth-gate";
import AppShell from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { apiFetch, formatMoney, fullDate } from "@/lib/client";
import { parseAmountToCents } from "@/lib/validation";

type Category = { id: string; name: string; color: string };
type Transaction = {
  id: string;
  merchant: string;
  amountCents: number;
  direction: string;
  date: string;
  category: Category | null;
  isSocial: boolean;
  isDating: boolean;
  notes: string | null;
  source: string;
  predictionSource: string | null;
};

type EditorValues = {
  merchant: string;
  amount: string;
  direction: "expense" | "income";
  date: string;
  categoryId: string;
  isSocial: boolean;
  isDating: boolean;
  notes: string;
};

const today = () => new Date().toISOString().slice(0, 10);

function toEditor(transaction?: Transaction): EditorValues {
  return transaction
    ? {
        merchant: transaction.merchant,
        amount: (transaction.amountCents / 100).toFixed(2),
        direction: transaction.direction === "income" ? "income" : "expense",
        date: transaction.date.slice(0, 10),
        categoryId: transaction.category?.id ?? "",
        isSocial: transaction.isSocial,
        isDating: transaction.isDating,
        notes: transaction.notes ?? "",
      }
    : { merchant: "", amount: "", direction: "expense", date: today(), categoryId: "", isSocial: false, isDating: false, notes: "" };
}

function TransactionForm({
  categories,
  editing,
  onSaved,
  onCancel,
}: {
  categories: Category[];
  editing: Transaction | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<EditorValues>(() => toEditor(editing ?? undefined));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues(toEditor(editing ?? undefined));
    setError("");
  }, [editing]);

  function update<K extends keyof EditorValues>(key: K, value: EditorValues[K]) {
    setValues((current) => {
      const next = { ...current, [key]: value };
      if (key === "categoryId") {
        const cat = categories.find((c) => c.id === value);
        if (cat?.name.toLowerCase() === "income") {
          next.direction = "income";
          next.isSocial = false;
          next.isDating = false;
        }
      } else if (key === "direction") {
        if (value === "income") {
          next.isSocial = false;
          next.isDating = false;
        }
      }
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const amountCents = parseAmountToCents(values.amount);
    if (!amountCents) {
      setError("Enter a valid positive amount, such as 18.50.");
      return;
    }
    const miscCategory = categories.find((c) => c.name.toLowerCase() === "misc");
    const finalCategoryId = values.categoryId || miscCategory?.id || null;

    setSaving(true);
    try {
      const payload = {
        merchant: values.merchant,
        amountCents,
        direction: values.direction,
        date: new Date(`${values.date}T12:00:00`).toISOString(),
        categoryId: finalCategoryId,
        isSocial: values.direction === "expense" && values.isSocial,
        isDating: values.direction === "expense" && values.isDating,
        notes: values.notes || null,
        source: "manual",
      };
      if (editing) {
        await apiFetch(`/api/transactions/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/transactions", { method: "POST", body: JSON.stringify(payload) });
      }
      setValues(toEditor());
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save transaction.");
    } finally {
      setSaving(false);
    }
  }

  const miscCategory = categories.find((c) => c.name.toLowerCase() === "misc");

  return (
    <section className="surface" aria-labelledby="transaction-form-title">
      <div className="surface-header">
        <div>
          <h2 id="transaction-form-title">{editing ? "Edit transaction" : "Add a transaction"}</h2>
        </div>
        {editing ? <button className="button button-quiet" type="button" onClick={onCancel}>Cancel</button> : null}
      </div>
      <div className="surface-body">
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="transaction-merchant">Merchant or source</label>
              <input id="transaction-merchant" className="input" value={values.merchant} onChange={(event) => update("merchant", event.target.value)} placeholder="Neighborhood market" required />
            </div>
            <div className="field">
              <label htmlFor="transaction-amount">Amount</label>
              <input id="transaction-amount" className="input" inputMode="decimal" value={values.amount} onChange={(event) => update("amount", event.target.value)} placeholder="0.00" required />
            </div>
            <div className="field">
              <label htmlFor="transaction-direction">Direction</label>
              <select id="transaction-direction" className="select" value={values.direction} onChange={(event) => update("direction", event.target.value as EditorValues["direction"])}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="transaction-date">Date</label>
              <input id="transaction-date" className="input" type="date" value={values.date} onChange={(event) => update("date", event.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="transaction-category">Category</label>
              <select id="transaction-category" className="select" value={values.categoryId || miscCategory?.id || ""} onChange={(event) => update("categoryId", event.target.value)}>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
            <div className="field full">
              <label htmlFor="transaction-notes">Notes</label>
              <textarea id="transaction-notes" className="textarea" value={values.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Optional context" />
            </div>
          </div>
          {values.direction === "expense" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 15 }}>
              <label className={`social-toggle${values.isSocial ? " social-toggle-active" : ""}`}>
                <span className="toggle-copy"><strong>Social</strong><span>Social lens</span></span>
                <input className="sr-only" type="checkbox" checked={values.isSocial} onChange={(event) => update("isSocial", event.target.checked)} />
                <span className="toggle-switch" aria-hidden="true" />
              </label>
              <label className={`social-toggle${values.isDating ? " dating-toggle-active" : ""}`}>
                <span className="toggle-copy"><strong>Dating</strong><span>Dating lens</span></span>
                <input className="sr-only" type="checkbox" checked={values.isDating} onChange={(event) => update("isDating", event.target.checked)} />
                <span className="toggle-switch" aria-hidden="true" />
              </label>
            </div>
          ) : null}
          {error ? <div className="form-error" role="alert" style={{ marginTop: 14 }}>{error}</div> : null}
          <div className="form-actions">
            <button className="button button-primary" type="submit" disabled={saving}>
              <Icon name={editing ? "check" : "plus"} className="icon-sm" />
              {saving ? "Saving…" : editing ? "Save changes" : "Add transaction"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function TransactionsWorkspace() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [socialOnly, setSocialOnly] = useState(false);
  const [datingOnly, setDatingOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await apiFetch<Category[]>("/api/categories"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load categories.");
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (query) params.set("q", query);
      if (direction) params.set("direction", direction);
      if (categoryId) params.set("categoryId", categoryId);
      if (socialOnly) params.set("social", "true");
      if (datingOnly) params.set("dating", "true");
      const result = await apiFetch<{ transactions: Transaction[]; pagination: { pageCount: number; total: number } }>(`/api/transactions?${params}`);
      setTransactions(result.transactions);
      setPageCount(result.pagination.pageCount);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load transactions.");
    } finally {
      setLoading(false);
    }
  }, [categoryId, datingOnly, direction, page, query, socialOnly]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get("social") === "true") {
        setSocialOnly(true);
      }
      if (searchParams.get("dating") === "true") {
        setDatingOnly(true);
      }
      if (searchParams.get("categoryId")) {
        setCategoryId(searchParams.get("categoryId")!);
      }
    }
  }, []);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  async function remove(transaction: Transaction) {
    if (!window.confirm(`Delete the ${transaction.merchant} transaction?`)) return;
    try {
      await apiFetch(`/api/transactions/${transaction.id}`, { method: "DELETE" });
      await loadTransactions();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete transaction.");
    }
  }

  function saved() {
    setEditing(null);
    void loadTransactions();
  }

  return (
    <AppShell
      title="Transactions"
      actions={<Link className="button button-primary" href="/mobile"><Icon name="plus" className="icon-sm" />Add</Link>}
    >
      {error ? <div className="form-error" role="alert" style={{ marginBottom: 18 }}>{error}</div> : null}
      <div className="workspace-grid">
        <section className="surface" aria-labelledby="transaction-list-title">
          <div className="surface-header">
            <div><h2 id="transaction-list-title">The ledger</h2></div>
          </div>
          <div className="table-toolbar">
            <div className="toolbar-filters">
              <label className="sr-only" htmlFor="transaction-search">Search</label>
              <input id="transaction-search" className="input compact-input" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search merchant, note, social, dating" />
              <label className="sr-only" htmlFor="category-filter">Filter category</label>
              <select id="category-filter" className="select" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}>
                <option value="">All categories</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <label className="sr-only" htmlFor="direction-filter">Filter direction</label>
              <select id="direction-filter" className="select" value={direction} onChange={(event) => { setDirection(event.target.value); setPage(1); }}>
                <option value="">All flows</option>
                <option value="expense">Expenses</option>
                <option value="income">Income</option>
              </select>
              <div className="filter-chips-row">
                <button
                  type="button"
                  className={`filter-chip${socialOnly ? " filter-chip-active" : ""}`}
                  onClick={() => { setSocialOnly((current) => !current); setPage(1); }}
                  aria-pressed={socialOnly}
                >
                  <Icon name="users" className="icon-sm" />
                  Social
                </button>
                <button
                  type="button"
                  className={`filter-chip${datingOnly ? " filter-chip-active-dating" : ""}`}
                  onClick={() => { setDatingOnly((current) => !current); setPage(1); }}
                  aria-pressed={datingOnly}
                >
                  <Icon name="heart" className="icon-sm" />
                  Dating
                </button>
              </div>
            </div>
          </div>
          {loading ? <div className="surface-body"><div className="loading-block" /></div> : transactions.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Merchant</th><th>Date</th><th>Category</th><th>Amount</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>
                        <strong>{transaction.merchant}</strong>
                        {transaction.isSocial ? <span className="social-pill" style={{ marginLeft: 7 }}><Icon name="users" className="icon-sm" /> Social</span> : null}
                        {transaction.isDating ? <span className="dating-pill" style={{ marginLeft: 7 }}><Icon name="heart" className="icon-sm" /> Dating</span> : null}
                      </td>
                      <td className="mono">{fullDate(transaction.date)}</td>
                      <td><span className="category-pill">{transaction.category?.name ?? "Uncategorized"}</span></td>
                      <td className={`mono${transaction.direction === "income" ? " metric-detail positive" : " metric-detail negative"}`}>{formatMoney(transaction.amountCents, transaction.direction)}</td>
                      <td><div className="table-actions"><button className="text-button" type="button" onClick={() => setEditing(transaction)}>Edit</button><button className="text-button" type="button" onClick={() => void remove(transaction)}>Delete</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state"><div><strong>No records match this route.</strong><p>Try another filter, or add your first transaction from the form.</p></div></div>}
          <div className="pagination">
            <span>Page {page} of {pageCount}</span>
            <div className="pagination-actions">
              <button className="button button-quiet" type="button" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={page <= 1}><Icon name="chevron-left" className="icon-sm" />Previous</button>
              <button className="button button-quiet" type="button" onClick={() => setPage((current) => Math.min(current + 1, pageCount))} disabled={page >= pageCount}>Next<Icon name="chevron-right" className="icon-sm" /></button>
            </div>
          </div>
        </section>
        <TransactionForm categories={categories} editing={editing} onSaved={saved} onCancel={() => setEditing(null)} />
      </div>
    </AppShell>
  );
}

export default function TransactionsPage() {
  return <AuthGate><TransactionsWorkspace /></AuthGate>;
}
