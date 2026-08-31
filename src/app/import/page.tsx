"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import AuthGate from "@/components/auth-gate";
import AppShell from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { apiFetch, formatMoney, fullDate } from "@/lib/client";

type Category = { id: string; name: string; color: string };
type Batch = {
  id: string;
  sourceFilename: string;
  parserVersion: string;
  status: string;
  totalRows: number;
  parsedRows: number;
  reviewRows: number;
  duplicateRows: number;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  createdAt: string;
  committedAt: string | null;
};
type ImportRow = {
  id: string;
  date: string | null;
  merchantRaw: string;
  amountRaw: string;
  amountCents: number | null;
  direction: string | null;
  categoryId: string | null;
  category: Category | null;
  status: string;
  duplicateKind: string | null;
  parsedConfidence: number | null;
  reviewNote: string | null;
};
type BatchDetail = Batch & { rows: ImportRow[] };

function ImportWorkspace() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<BatchDetail | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyRow, setBusyRow] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [batchData, categoryData] = await Promise.all([
        apiFetch<Batch[]>("/api/imports"),
        apiFetch<Category[]>("/api/categories"),
      ]);
      setBatches(batchData);
      setCategories(categoryData);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load import history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function selectBatch(id: string) {
    setError("");
    try {
      setSelected(await apiFetch<BatchDetail>(`/api/imports/${id}`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load this import.");
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a PDF or text statement first.");
      return;
    }
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const batch = await apiFetch<Batch>("/api/imports", { method: "POST", body: formData });
      setFile(null);
      const input = document.getElementById("statement-file") as HTMLInputElement | null;
      if (input) input.value = "";
      setMessage(`${batch.totalRows} rows staged for review. Nothing has been added to the ledger yet.`);
      await load();
      await selectBatch(batch.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to parse this statement.");
    } finally {
      setUploading(false);
    }
  }

  async function updateRow(row: ImportRow, update: { status?: string; categoryId?: string | null; notes?: string | null }) {
    if (!selected || selected.status === "committed") return;
    setBusyRow(row.id);
    setError("");
    try {
      const result = await apiFetch<{ row: ImportRow }>(`/api/imports/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ rowId: row.id, status: update.status ?? row.status, categoryId: update.categoryId ?? row.categoryId, notes: update.notes ?? row.reviewNote }),
      });
      setSelected((current) => current ? { ...current, rows: current.rows.map((item) => item.id === row.id ? result.row : item), reviewRows: current.rows.filter((item) => item.id === row.id ? result.row.status === "review" : item.status === "review").length, parsedRows: current.rows.filter((item) => item.id === row.id ? result.row.status === "ready" : item.status === "ready").length } : current);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update that row.");
    } finally {
      setBusyRow("");
    }
  }

  async function commit() {
    if (!selected) return;
    if (!window.confirm("Import all rows marked ready into the canonical ledger?")) return;
    setBusyRow("commit");
    setError("");
    try {
      await apiFetch(`/api/imports/${selected.id}/commit`, { method: "POST" });
      setMessage("Ready rows are now in the ledger.");
      await load();
      await selectBatch(selected.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to commit this import.");
    } finally {
      setBusyRow("");
    }
  }

  return (
    <AppShell title="Import statements" description="Optional historical backfill, held outside the ledger until you review it.">
      {error ? <div className="form-error" role="alert" style={{ marginBottom: 18 }}>{error}</div> : null}
      {message ? <div className="form-success" role="status" style={{ marginBottom: 18 }}>{message}</div> : null}
      <div className="workspace-grid">
        <div className="workspace-stack">
          <section className="surface" aria-labelledby="upload-title">
            <div className="surface-header"><div><h2 id="upload-title">Stage a statement</h2><p>The parser reads a copy in memory; the original file is not stored.</p></div><Icon name="upload" className="icon-lg" /></div>
            <div className="surface-body">
              <form onSubmit={upload}>
                <label className="import-drop" htmlFor="statement-file">
                  <span><strong>{file ? file.name : "Choose a TD statement"}</strong><p>PDF is supported for TD text-based statements. TXT is useful for parser fixtures.</p><span className="button button-secondary"><Icon name="file" className="icon-sm" />Browse files</span></span>
                </label>
                <input id="statement-file" className="sr-only" type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                <div className="form-actions"><button className="button button-primary" type="submit" disabled={uploading || !file}><Icon name="upload" className="icon-sm" />{uploading ? "Parsing…" : "Stage for review"}</button></div>
              </form>
            </div>
          </section>
          <section className="surface" aria-labelledby="history-title">
            <div className="surface-header"><div><h2 id="history-title">Import history</h2><p>Every staged file keeps its review trail.</p></div><Icon name="book" className="icon-lg" /></div>
            {loading ? <div className="surface-body"><div className="loading-block" /></div> : batches.length ? <div className="ledger-list">{batches.map((batch) => <button key={batch.id} type="button" className={`ledger-row${selected?.id === batch.id ? " nav-link-active" : ""}`} style={{ width: "100%", color: "inherit", background: "transparent", textAlign: "left", border: 0, borderBottom: "1px solid var(--line)" }} onClick={() => void selectBatch(batch.id)}><span className="ledger-main"><span className="merchant-dot"><Icon name="file" className="icon-sm" /></span><span><span className="ledger-name">{batch.sourceFilename}</span><span className="ledger-subline">{batch.totalRows} rows · {batch.reviewRows} need review · {batch.status}</span></span></span><span className="ledger-date">{fullDate(batch.createdAt)}</span><span className="status-badge status-review">{batch.status}</span></button>)}</div> : <div className="empty-state"><div><strong>No statements staged.</strong><p>Start fresh from today, or bring a statement here when you want historical context.</p></div></div>}
          </section>
        </div>

        <section className="surface" aria-labelledby="review-title">
          <div className="surface-header"><div><h2 id="review-title">{selected ? "Review rows" : "Review before commit"}</h2><p>{selected ? `${selected.sourceFilename} · parser ${selected.parserVersion}` : "Select a staged statement to inspect its rows."}</p></div>{selected && selected.status !== "committed" ? <button className="button button-primary" type="button" onClick={() => void commit()} disabled={busyRow === "commit" || selected.rows.every((row) => row.status !== "ready")}><Icon name="check" className="icon-sm" />{busyRow === "commit" ? "Committing…" : "Import ready rows"}</button> : null}</div>
          {selected ? <div className="surface-body">
            <div className="import-summary"><div className="summary-cell"><span>Found</span><strong>{selected.totalRows}</strong></div><div className="summary-cell"><span>Ready</span><strong>{selected.parsedRows}</strong></div><div className="summary-cell"><span>Review</span><strong>{selected.reviewRows}</strong></div><div className="summary-cell"><span>Duplicates</span><strong>{selected.duplicateRows}</strong></div></div>
            <div className="import-list">{selected.rows.map((row) => <div className="import-row" key={row.id}><span className="import-row-main"><strong>{row.merchantRaw}</strong><span>{row.date ? fullDate(row.date) : "Date needs review"} · {row.amountCents ? formatMoney(row.amountCents, row.direction ?? "expense") : row.amountRaw}{row.duplicateKind ? ` · ${row.duplicateKind} duplicate` : ""}</span></span><span className={`status-badge status-${row.status}`}>{row.status}</span><select className="select import-select" value={row.categoryId ?? ""} onChange={(event) => void updateRow(row, { categoryId: event.target.value || null })} disabled={selected.status === "committed" || busyRow === row.id}><option value="">Uncategorized</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select><select className="select import-note" value={row.status} onChange={(event) => void updateRow(row, { status: event.target.value })} disabled={selected.status === "committed" || busyRow === row.id}><option value="ready">Ready to import</option><option value="review">Needs review</option><option value="ignored">Ignore row</option></select></div>)}</div>
          </div> : <div className="empty-state" style={{ minHeight: 400 }}><div><Icon name="file" className="icon-lg" /><strong>Nothing committed without a human check.</strong><p>Choose a batch from the history to validate dates, amounts, categories, and duplicate signals.</p></div></div>}
        </section>
      </div>
    </AppShell>
  );
}

export default function ImportPage() {
  return <AuthGate><ImportWorkspace /></AuthGate>;
}
