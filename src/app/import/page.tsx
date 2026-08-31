"use client";

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
  direction: "expense" | "income" | null;
  categoryId: string | null;
  category: Category | null;
  status: "ready" | "review" | "ignored" | "committed";
  duplicateKind: "exact" | "probable" | null;
  parsedConfidence: number | null;
  reviewNote: string | null;
};

type BatchDetail = Batch & { rows: ImportRow[] };

type FilterStatus = "all" | "review" | "ready" | "duplicates" | "ignored";

function formatIsoDateForInput(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function ImportWorkspace() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<BatchDetail | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyRow, setBusyRow] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [showAddRow, setShowAddRow] = useState(false);

  // New row form state
  const [newMerchant, setNewMerchant] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDirection, setNewDirection] = useState<"expense" | "income">("expense");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newCategoryId, setNewCategoryId] = useState("");
  const [addingRow, setAddingRow] = useState(false);

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

  const handleFileSelect = (selectedFile: File | null) => {
    setFile(selectedFile);
    if (selectedFile && selectedFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setImagePreview(null);
    }
  };

  const onDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  async function selectBatch(id: string) {
    setError("");
    setMessage("");
    setShowAddRow(false);
    try {
      const detail = await apiFetch<BatchDetail>(`/api/imports/${id}`);
      setSelected(detail);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load this import.");
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose an income or bank statement image, PDF, or text file first.");
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
      setImagePreview(null);
      const input = document.getElementById("statement-file") as HTMLInputElement | null;
      if (input) input.value = "";
      setMessage(
        `Extracted ${batch.totalRows} records (${batch.parsedRows} ready, ${batch.reviewRows} needing review). Held outside the ledger until you approve.`,
      );
      await load();
      await selectBatch(batch.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to parse this statement.");
    } finally {
      setUploading(false);
    }
  }

  async function updateRow(
    row: ImportRow,
    update: {
      merchantRaw?: string;
      amountCents?: number;
      direction?: "expense" | "income";
      date?: string | null;
      status?: "ready" | "review" | "ignored";
      categoryId?: string | null;
      notes?: string | null;
    },
  ) {
    if (!selected || selected.status === "committed") return;
    setBusyRow(row.id);
    setError("");
    try {
      const result = await apiFetch<{ row: ImportRow }>(`/api/imports/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          rowId: row.id,
          merchantRaw: update.merchantRaw !== undefined ? update.merchantRaw : row.merchantRaw,
          amountCents: update.amountCents !== undefined ? update.amountCents : row.amountCents,
          direction: update.direction !== undefined ? update.direction : row.direction,
          date: update.date !== undefined ? update.date : row.date,
          status: update.status !== undefined ? update.status : row.status,
          categoryId: update.categoryId !== undefined ? update.categoryId : row.categoryId,
          notes: update.notes !== undefined ? update.notes : row.reviewNote,
        }),
      });

      setSelected((current) => {
        if (!current) return current;
        const newRows = current.rows.map((item) => (item.id === row.id ? result.row : item));
        const reviewRows = newRows.filter((r) => r.status === "review").length;
        const parsedRows = newRows.filter((r) => r.status === "ready").length;
        const duplicateRows = newRows.filter((r) => Boolean(r.duplicateKind)).length;
        return {
          ...current,
          rows: newRows,
          reviewRows,
          parsedRows,
          duplicateRows,
        };
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update that row.");
    } finally {
      setBusyRow("");
    }
  }

  async function markAllReady() {
    if (!selected || selected.status === "committed") return;
    setBusyRow("mark-all");
    setError("");
    try {
      const rowsToUpdate = selected.rows.filter((r) => r.status !== "ready" && r.status !== "ignored");
      for (const row of rowsToUpdate) {
        await apiFetch(`/api/imports/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            rowId: row.id,
            status: "ready",
            notes: null,
          }),
        });
      }
      await selectBatch(selected.id);
      setMessage("All unignored rows marked ready for import.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update all rows.");
    } finally {
      setBusyRow("");
    }
  }

  async function deleteRow(rowId: string) {
    if (!selected || selected.status === "committed") return;
    if (!window.confirm("Remove this row from the staged batch?")) return;
    setBusyRow(rowId);
    setError("");
    try {
      await apiFetch(`/api/imports/${selected.id}/rows/${rowId}`, {
        method: "DELETE",
      });
      setSelected((current) => {
        if (!current) return current;
        const newRows = current.rows.filter((r) => r.id !== rowId);
        return {
          ...current,
          totalRows: newRows.length,
          reviewRows: newRows.filter((r) => r.status === "review").length,
          parsedRows: newRows.filter((r) => r.status === "ready").length,
          duplicateRows: newRows.filter((r) => Boolean(r.duplicateKind)).length,
          rows: newRows,
        };
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete that row.");
    } finally {
      setBusyRow("");
    }
  }

  async function handleAddRowSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected || selected.status === "committed") return;
    const amountFloat = parseFloat(newAmount.replace(/[^0-9.]/g, ""));
    if (Number.isNaN(amountFloat) || amountFloat <= 0) {
      setError("Please enter a valid positive dollar amount.");
      return;
    }
    const amountCents = Math.round(amountFloat * 100);

    setAddingRow(true);
    setError("");
    try {
      const result = await apiFetch<{ row: ImportRow }>(`/api/imports/${selected.id}/rows`, {
        method: "POST",
        body: JSON.stringify({
          merchantRaw: newMerchant.trim() || "Transaction",
          amountCents,
          direction: newDirection,
          date: newDate ? new Date(newDate).toISOString() : new Date().toISOString(),
          categoryId: newCategoryId || null,
          status: "ready",
        }),
      });

      setSelected((current) => {
        if (!current) return current;
        const newRows = [...current.rows, result.row];
        return {
          ...current,
          totalRows: newRows.length,
          parsedRows: newRows.filter((r) => r.status === "ready").length,
          reviewRows: newRows.filter((r) => r.status === "review").length,
          rows: newRows,
        };
      });

      // Reset form
      setNewMerchant("");
      setNewAmount("");
      setShowAddRow(false);
      setMessage("New record added to batch.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to add row.");
    } finally {
      setAddingRow(false);
    }
  }

  async function commit() {
    if (!selected) return;
    const readyCount = selected.rows.filter((r) => r.status === "ready").length;
    if (readyCount === 0) {
      setError("No rows are marked 'Ready to import'. Please review and mark rows ready before committing.");
      return;
    }
    if (!window.confirm(`Commit ${readyCount} ready transaction(s) into your canonical financial ledger?`)) {
      return;
    }

    setBusyRow("commit");
    setError("");
    try {
      const res = await apiFetch<{ committed: boolean; transactionCount: number }>(
        `/api/imports/${selected.id}/commit`,
        { method: "POST" },
      );
      setMessage(`Successfully imported ${res.transactionCount} transactions into your ledger!`);
      await load();
      await selectBatch(selected.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to commit this import.");
    } finally {
      setBusyRow("");
    }
  }

  // Filter rows
  const filteredRows = selected
    ? selected.rows.filter((row) => {
        if (filter === "all") return true;
        if (filter === "review") return row.status === "review";
        if (filter === "ready") return row.status === "ready";
        if (filter === "duplicates") return Boolean(row.duplicateKind);
        if (filter === "ignored") return row.status === "ignored";
        return true;
      })
    : [];

  const totalExpenseCents = selected
    ? selected.rows
        .filter((r) => r.status === "ready" && r.direction === "expense" && r.amountCents)
        .reduce((sum, r) => sum + (r.amountCents || 0), 0)
    : 0;

  const totalIncomeCents = selected
    ? selected.rows
        .filter((r) => r.status === "ready" && r.direction === "income" && r.amountCents)
        .reduce((sum, r) => sum + (r.amountCents || 0), 0)
    : 0;

  return (
    <AppShell
      title="Import statements"
      description="OCR document extraction and review pipeline. Review, edit, and approve before adding to your ledger."
    >
      {error ? (
        <div className="form-error" role="alert" style={{ marginBottom: 18 }}>
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="form-success" role="status" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span>{message}</span>
            {selected?.status === "committed" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <Link href="/transactions" className="button button-sm button-secondary">
                  View Transactions
                </Link>
                <Link href="/dashboard" className="button button-sm button-primary">
                  Dashboard
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="workspace-grid">
        <div className="workspace-stack">
          {/* Upload card */}
          <section className="surface" aria-labelledby="upload-title">
            <div className="surface-header">
              <div>
                <h2 id="upload-title">Import Statement</h2>
                <p>Upload a statement screenshot, photo (OCR), PDF, or text file.</p>
              </div>
              <Icon name="upload" className="icon-lg" />
            </div>
            <div className="surface-body">
              <form onSubmit={upload}>
                <label
                  className={`import-drop ${isDragging ? "import-drop-active" : ""}`}
                  htmlFor="statement-file"
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                >
                  <span>
                    <strong>{file ? file.name : "Drop statement image or PDF here"}</strong>
                    <p>Supported: PNG, JPG, WEBP photos/screenshots, TD PDF statements, & TXT fixtures.</p>
                    <span className="button button-secondary button-sm">
                      <Icon name="file" className="icon-sm" />
                      Browse files
                    </span>
                  </span>
                </label>
                <input
                  id="statement-file"
                  className="sr-only"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/bmp,image/tiff,.png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,application/pdf,text/plain"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    handleFileSelect(event.target.files?.[0] ?? null)
                  }
                />

                {imagePreview ? (
                  <div className="import-preview-box">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Statement preview" className="import-preview-img" />
                    <div>
                      <strong>Image ready for OCR</strong>
                      <div className="muted">{file?.name} · {(file?.size ? file.size / 1024 : 0).toFixed(1)} KB</div>
                    </div>
                  </div>
                ) : null}

                {uploading ? (
                  <div className="ocr-progress-card">
                    <div className="ocr-spinner" />
                    <div>
                      <strong>Analyzing document with OCR...</strong>
                      <div>Extracting dates, merchants, amounts, and inferring categories.</div>
                    </div>
                  </div>
                ) : null}

                <div className="form-actions" style={{ marginTop: 14 }}>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={uploading || !file}
                    style={{ width: "100%" }}
                  >
                    <Icon name="spark" className="icon-sm" />
                    {uploading ? "Extracting records…" : "Stage Statement for Review"}
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* Import History */}
          <section className="surface" aria-labelledby="history-title">
            <div className="surface-header">
              <div>
                <h2 id="history-title">Import History</h2>
                <p>Review and audit staged files.</p>
              </div>
              <Icon name="book" className="icon-lg" />
            </div>
            {loading ? (
              <div className="surface-body">
                <div className="loading-block" />
              </div>
            ) : batches.length ? (
              <div className="ledger-list">
                {batches.map((batch) => {
                  const isOcr = batch.parserVersion.includes("ocr");
                  return (
                    <button
                      key={batch.id}
                      type="button"
                      className={`ledger-row${selected?.id === batch.id ? " nav-link-active" : ""}`}
                      style={{
                        width: "100%",
                        color: "inherit",
                        background: "transparent",
                        textAlign: "left",
                        border: 0,
                        borderBottom: "1px solid var(--line)",
                      }}
                      onClick={() => void selectBatch(batch.id)}
                    >
                      <span className="ledger-main">
                        <span className="merchant-dot">
                          <Icon name={isOcr ? "image" : "file"} className="icon-sm" />
                        </span>
                        <span>
                          <span className="ledger-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {batch.sourceFilename}
                            <span className={`parser-badge ${isOcr ? "parser-badge-ocr" : ""}`}>
                              {isOcr ? "OCR" : batch.parserVersion.includes("pdf") ? "PDF" : "TXT"}
                            </span>
                          </span>
                          <span className="ledger-subline">
                            {batch.totalRows} rows · {batch.reviewRows} review · {batch.status}
                          </span>
                        </span>
                      </span>
                      <span className="ledger-date">{fullDate(batch.createdAt)}</span>
                      <span className={`status-badge status-${batch.status}`}>{batch.status}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <div>
                  <strong>No statements staged yet.</strong>
                  <p>Upload a statement screenshot or bank export to start historical review.</p>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Selected Batch Review */}
        <section className="surface" aria-labelledby="review-title">
          <div className="surface-header">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 id="review-title">{selected ? "Review Extracted Records" : "Review Before Committing"}</h2>
                {selected ? (
                  <span
                    className={`parser-badge ${selected.parserVersion.includes("ocr") ? "parser-badge-ocr" : ""}`}
                  >
                    {selected.parserVersion.includes("ocr")
                      ? "OCR Engine"
                      : selected.parserVersion.includes("pdf")
                        ? "PDF Parser"
                        : "Text Parser"}
                  </span>
                ) : null}
              </div>
              <p>
                {selected
                  ? `${selected.sourceFilename} · Edit records below to ensure dates, amounts, and merchants are accurate.`
                  : "Select a staged statement from the history to inspect and edit its records."}
              </p>
            </div>

            {selected && selected.status !== "committed" ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="button button-secondary button-sm"
                  type="button"
                  onClick={() => setShowAddRow((v) => !v)}
                >
                  <Icon name="plus" className="icon-sm" />
                  {showAddRow ? "Cancel Add" : "Add Row"}
                </button>
                <button
                  className="button button-secondary button-sm"
                  type="button"
                  onClick={() => void markAllReady()}
                  disabled={busyRow === "mark-all" || selected.rows.every((r) => r.status === "ready")}
                >
                  <Icon name="check" className="icon-sm" />
                  Mark All Ready
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => void commit()}
                  disabled={busyRow === "commit" || selected.rows.every((row) => row.status !== "ready")}
                >
                  <Icon name="check" className="icon-sm" />
                  {busyRow === "commit"
                    ? "Importing…"
                    : `Submit ${selected.rows.filter((r) => r.status === "ready").length} Ready Rows`}
                </button>
              </div>
            ) : null}
          </div>

          {selected ? (
            <div className="surface-body">
              {/* Summary Stats */}
              <div className="import-summary">
                <div className="summary-cell">
                  <span>Found</span>
                  <strong>{selected.totalRows}</strong>
                </div>
                <div className="summary-cell">
                  <span>Ready</span>
                  <strong style={{ color: "var(--teal)" }}>{selected.parsedRows}</strong>
                </div>
                <div className="summary-cell">
                  <span>Needs Review</span>
                  <strong style={{ color: selected.reviewRows > 0 ? "var(--sun)" : "inherit" }}>
                    {selected.reviewRows}
                  </strong>
                </div>
                <div className="summary-cell">
                  <span>Duplicates</span>
                  <strong style={{ color: selected.duplicateRows > 0 ? "var(--danger)" : "inherit" }}>
                    {selected.duplicateRows}
                  </strong>
                </div>
                <div className="summary-cell">
                  <span>Ready Expenses</span>
                  <strong style={{ color: "var(--signal)" }}>{formatMoney(totalExpenseCents, "expense")}</strong>
                </div>
                <div className="summary-cell">
                  <span>Ready Income</span>
                  <strong style={{ color: "var(--teal)" }}>{formatMoney(totalIncomeCents, "income")}</strong>
                </div>
              </div>

              {/* Add Missing Row Card */}
              {showAddRow ? (
                <div
                  className="import-row-card"
                  style={{ border: "2px solid var(--teal)", background: "#f5faf8", marginBottom: 16 }}
                >
                  <form onSubmit={handleAddRowSubmit}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "var(--teal-deep)" }}>
                      Add Missing Transaction Record
                    </div>
                    <div className="import-row-grid">
                      <div>
                        <label className="eyebrow" style={{ display: "block", marginBottom: 4 }}>
                          Date
                        </label>
                        <input
                          type="date"
                          className="import-input"
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className="eyebrow" style={{ display: "block", marginBottom: 4 }}>
                          Merchant / Description
                        </label>
                        <input
                          type="text"
                          className="import-input"
                          placeholder="e.g. Starbucks or Salary"
                          value={newMerchant}
                          onChange={(e) => setNewMerchant(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className="eyebrow" style={{ display: "block", marginBottom: 4 }}>
                          Amount ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          className="import-input"
                          placeholder="0.00"
                          value={newAmount}
                          onChange={(e) => setNewAmount(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className="eyebrow" style={{ display: "block", marginBottom: 4 }}>
                          Direction
                        </label>
                        <div className="direction-toggle" style={{ width: "100%" }}>
                          <button
                            type="button"
                            className={`direction-btn ${newDirection === "expense" ? "direction-btn-expense-active" : ""}`}
                            style={{ flex: 1 }}
                            onClick={() => setNewDirection("expense")}
                          >
                            Expense (-)
                          </button>
                          <button
                            type="button"
                            className={`direction-btn ${newDirection === "income" ? "direction-btn-income-active" : ""}`}
                            style={{ flex: 1 }}
                            onClick={() => setNewDirection("income")}
                          >
                            Income (+)
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="eyebrow" style={{ display: "block", marginBottom: 4 }}>
                          Category
                        </label>
                        <select
                          className="select import-input"
                          value={newCategoryId || categories.find((c) => c.name.toLowerCase() === "misc")?.id || ""}
                          onChange={(e) => setNewCategoryId(e.target.value)}
                        >
                          {categories.map((cat) => (
                            <option value={cat.id} key={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: "100%" }}>
                        <button
                          type="submit"
                          className="button button-primary button-sm"
                          disabled={addingRow}
                          style={{ height: 36 }}
                        >
                          <Icon name="check" className="icon-sm" />
                          {addingRow ? "Adding..." : "Add Record"}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              ) : null}

              {/* Filter Tabs */}
              <div className="import-filter-bar">
                <div className="import-tabs">
                  <button
                    type="button"
                    className={`import-tab-btn ${filter === "all" ? "import-tab-btn-active" : ""}`}
                    onClick={() => setFilter("all")}
                  >
                    All ({selected.totalRows})
                  </button>
                  <button
                    type="button"
                    className={`import-tab-btn ${filter === "review" ? "import-tab-btn-active" : ""}`}
                    onClick={() => setFilter("review")}
                  >
                    Needs Review ({selected.reviewRows})
                  </button>
                  <button
                    type="button"
                    className={`import-tab-btn ${filter === "ready" ? "import-tab-btn-active" : ""}`}
                    onClick={() => setFilter("ready")}
                  >
                    Ready ({selected.parsedRows})
                  </button>
                  {selected.duplicateRows > 0 ? (
                    <button
                      type="button"
                      className={`import-tab-btn ${filter === "duplicates" ? "import-tab-btn-active" : ""}`}
                      onClick={() => setFilter("duplicates")}
                      style={{ color: filter === "duplicates" ? "#fff" : "var(--danger)" }}
                    >
                      Duplicates ({selected.duplicateRows})
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`import-tab-btn ${filter === "ignored" ? "import-tab-btn-active" : ""}`}
                    onClick={() => setFilter("ignored")}
                  >
                    Ignored ({selected.rows.filter((r) => r.status === "ignored").length})
                  </button>
                </div>

                <div className="muted" style={{ fontSize: 11 }}>
                  {filteredRows.length} showing · Changes auto-save
                </div>
              </div>

              {/* Rows List */}
              <div className="import-list">
                {filteredRows.map((row) => {
                  const isCommitted = selected.status === "committed";
                  const isBusy = busyRow === row.id;
                  const cardClass =
                    row.status === "review"
                      ? "import-row-card import-row-card-review"
                      : row.status === "ignored"
                        ? "import-row-card import-row-card-ignored"
                        : "import-row-card";

                  return (
                    <div className={cardClass} key={row.id}>
                      {/* Top alert if duplicate or needs review note */}
                      {row.duplicateKind ? (
                        <div
                          className={`duplicate-alert-banner ${
                            row.duplicateKind === "exact" ? "duplicate-alert-banner-exact" : ""
                          }`}
                        >
                          <Icon name="spark" className="icon-sm" />
                          <span>
                            {row.duplicateKind === "exact"
                              ? "Exact Duplicate: An identical transaction already exists in your ledger."
                              : "Probable Duplicate: A transaction with matching date and amount exists."}
                          </span>
                        </div>
                      ) : null}

                      {row.reviewNote && !row.duplicateKind ? (
                        <div className="duplicate-alert-banner" style={{ background: "#fefae8", borderColor: "#faecd8" }}>
                          <span>Note: {row.reviewNote}</span>
                        </div>
                      ) : null}

                      <div className="import-row-grid">
                        {/* Date field */}
                        <div>
                          <label className="sr-only" htmlFor={`date-${row.id}`}>
                            Date
                          </label>
                          <input
                            id={`date-${row.id}`}
                            type="date"
                            className="import-input"
                            value={formatIsoDateForInput(row.date)}
                            onChange={(e) => {
                              const val = e.target.value;
                              void updateRow(row, {
                                date: val ? new Date(val).toISOString() : null,
                              });
                            }}
                            disabled={isCommitted || isBusy}
                            title="Transaction Date"
                          />
                        </div>

                        {/* Merchant field */}
                        <div>
                          <label className="sr-only" htmlFor={`merchant-${row.id}`}>
                            Merchant
                          </label>
                          <input
                            id={`merchant-${row.id}`}
                            type="text"
                            className="import-input"
                            defaultValue={row.merchantRaw}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val !== row.merchantRaw) {
                                void updateRow(row, { merchantRaw: val });
                              }
                            }}
                            disabled={isCommitted || isBusy}
                            placeholder="Merchant Name"
                            title="Merchant / Description"
                          />
                        </div>

                        {/* Amount & Direction */}
                        <div>
                          <label className="sr-only" htmlFor={`amount-${row.id}`}>
                            Amount
                          </label>
                          <div style={{ display: "flex", gap: 4 }}>
                            <input
                              id={`amount-${row.id}`}
                              type="number"
                              step="0.01"
                              min="0.01"
                              className="import-input"
                              style={{ width: "100%" }}
                              defaultValue={row.amountCents ? (row.amountCents / 100).toFixed(2) : ""}
                              onBlur={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!Number.isNaN(val) && val > 0) {
                                  const cents = Math.round(val * 100);
                                  if (cents !== row.amountCents) {
                                    void updateRow(row, { amountCents: cents });
                                  }
                                }
                              }}
                              disabled={isCommitted || isBusy}
                              placeholder="0.00"
                              title="Amount in Dollars"
                            />
                            <div className="direction-toggle">
                              <button
                                type="button"
                                className={`direction-btn ${
                                  row.direction === "expense" ? "direction-btn-expense-active" : ""
                                }`}
                                onClick={() => void updateRow(row, { direction: "expense" })}
                                disabled={isCommitted || isBusy}
                                title="Expense (-)"
                              >
                                -
                              </button>
                              <button
                                type="button"
                                className={`direction-btn ${
                                  row.direction === "income" ? "direction-btn-income-active" : ""
                                }`}
                                onClick={() => void updateRow(row, { direction: "income" })}
                                disabled={isCommitted || isBusy}
                                title="Income (+)"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Category Dropdown */}
                        <div>
                          <label className="sr-only" htmlFor={`cat-${row.id}`}>
                            Category
                          </label>
                          <select
                            id={`cat-${row.id}`}
                            className="select import-input"
                            value={row.categoryId || categories.find((c) => c.name.toLowerCase() === "misc")?.id || ""}
                            onChange={(event) =>
                              void updateRow(row, { categoryId: event.target.value || categories.find((c) => c.name.toLowerCase() === "misc")?.id || null })
                            }
                            disabled={isCommitted || isBusy}
                          >
                            {categories.map((category) => (
                              <option value={category.id} key={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Status Select */}
                        <div>
                          <label className="sr-only" htmlFor={`status-${row.id}`}>
                            Status
                          </label>
                          <select
                            id={`status-${row.id}`}
                            className="select import-input"
                            value={row.status}
                            onChange={(event) =>
                              void updateRow(row, {
                                status: event.target.value as "ready" | "review" | "ignored",
                              })
                            }
                            disabled={isCommitted || isBusy}
                          >
                            <option value="ready">Ready</option>
                            <option value="review">Needs review</option>
                            <option value="ignored">Ignore row</option>
                          </select>
                        </div>

                        {/* Delete action */}
                        <div>
                          {!isCommitted ? (
                            <button
                              type="button"
                              className="button button-quiet button-sm"
                              onClick={() => void deleteRow(row.id)}
                              disabled={isBusy}
                              title="Delete Row"
                              style={{ color: "var(--danger)", padding: "0 8px" }}
                            >
                              <Icon name="trash" className="icon-sm" />
                            </button>
                          ) : (
                            <span className="status-badge status-committed">Imported</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ minHeight: 400 }}>
              <div>
                <Icon name="file" className="icon-lg" />
                <strong>Nothing committed without human inspection.</strong>
                <p>
                  Upload an image or statement to parse rows with OCR. You can edit every field before committing.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

export default function ImportPage() {
  return (
    <AuthGate>
      <ImportWorkspace />
    </AuthGate>
  );
}
