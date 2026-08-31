"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGate from "@/components/auth-gate";
import AppShell from "@/components/app-shell";
import { apiFetch, fullDate } from "@/lib/client";
import { Icon } from "@/components/icon";

type Category = { id: string; name: string; color: string; transactionCount: number };
type Device = { id: string; name: string; permissions: string[]; lastUsedAt: string | null; revokedAt: string | null; createdAt: string };
type Rule = { id: string; pattern: string; priority: number; category: Category; createdAt: string };

function SettingsWorkspace() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState("#2a6f68");
  const [deviceName, setDeviceName] = useState("iPhone");
  const [enrollment, setEnrollment] = useState<{ code: string; enrollUrl: string; expiresAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [categoryData, deviceData, ruleData] = await Promise.all([
        apiFetch<Category[]>("/api/categories"),
        apiFetch<Device[]>("/api/devices"),
        apiFetch<Rule[]>("/api/rules"),
      ]);
      setCategories(categoryData);
      setDevices(deviceData);
      setRules(ruleData);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("category");
    setError("");
    try {
      await apiFetch("/api/categories", { method: "POST", body: JSON.stringify({ name: categoryName, color: categoryColor }) });
      setCategoryName("");
      setMessage("Category added.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to add category.");
    } finally {
      setBusy("");
    }
  }

  async function deleteCategory(category: Category) {
    if (!window.confirm(`Delete ${category.name}? Transactions will become uncategorized.`)) return;
    setBusy(category.id);
    try {
      await apiFetch(`/api/categories/${category.id}`, { method: "DELETE" });
      setMessage(`${category.name} deleted.`);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete category.");
    } finally {
      setBusy("");
    }
  }

  async function createEnrollment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("device");
    setError("");
    setEnrollment(null);
    try {
      const result = await apiFetch<{ code: string; enrollUrl: string; expiresAt: string }>("/api/devices", {
        method: "POST",
        body: JSON.stringify({ deviceName }),
      });
      setEnrollment(result);
      setMessage("One-time enrollment code created. It is shown only here.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create enrollment code.");
    } finally {
      setBusy("");
    }
  }

  async function revoke(device: Device) {
    if (!window.confirm(`Revoke ${device.name}? This device will stop creating transactions.`)) return;
    setBusy(device.id);
    try {
      await apiFetch(`/api/devices/${device.id}/revoke`, { method: "POST" });
      setMessage(`${device.name} revoked.`);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to revoke device.");
    } finally {
      setBusy("");
    }
  }

  return (
    <AppShell title="Settings" description="The controls around your private source of truth.">
      {error ? <div className="form-error" role="alert" style={{ marginBottom: 18 }}>{error}</div> : null}
      {message ? <div className="form-success" role="status" style={{ marginBottom: 18 }}>{message}</div> : null}
      {loading ? <div className="surface surface-body"><div className="loading-block" /></div> : (
        <div className="settings-grid">
          <section className="surface" aria-labelledby="categories-title">
            <div className="surface-header"><div><h2 id="categories-title">Categories</h2><p>{categories.length} available lanes for the ledger.</p></div><Icon name="book" className="icon-lg" /></div>
            <div className="surface-body">
              <form onSubmit={addCategory} className="form-grid">
                <div className="field"><label htmlFor="category-name">New category</label><input id="category-name" className="input" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Pet care" required /></div>
                <div className="field"><label htmlFor="category-color">Color</label><input id="category-color" className="input" type="color" value={categoryColor} onChange={(event) => setCategoryColor(event.target.value)} /></div>
                <div className="form-actions full"><button className="button button-secondary" type="submit" disabled={busy === "category"}><Icon name="plus" className="icon-sm" />{busy === "category" ? "Adding…" : "Add category"}</button></div>
              </form>
              <div className="rule-list" style={{ marginTop: 18 }}>
                {categories.map((category) => <div className="rule-row" key={category.id}><span className="rule-meta"><strong><span className="status-dot" style={{ background: category.color }} />{category.name}</strong><span>{category.transactionCount} transaction{category.transactionCount === 1 ? "" : "s"}</span></span><button className="text-button" type="button" onClick={() => void deleteCategory(category)} disabled={busy === category.id}>Delete</button></div>)}
              </div>
            </div>
          </section>

          <section className="surface" aria-labelledby="device-title">
            <div className="surface-header"><div><h2 id="device-title">Authorized devices</h2><p>Write access is explicit and revocable.</p></div><Icon name="smartphone" className="icon-lg" /></div>
            <div className="surface-body">
              <form onSubmit={createEnrollment} className="form-grid">
                <div className="field"><label htmlFor="device-name">New device name</label><input id="device-name" className="input" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} required /></div>
                <div className="form-actions" style={{ alignItems: "end", marginTop: 0 }}><button className="button button-secondary" type="submit" disabled={busy === "device"}><Icon name="plus" className="icon-sm" />Generate code</button></div>
              </form>
              {enrollment ? <div className="form-notice" style={{ marginTop: 16 }}><strong>Open this link on the phone before it expires.</strong><div className="device-code">{enrollment.code}</div><div className="device-code-note mono">{enrollment.enrollUrl}</div><p className="field-help">Expires {new Date(enrollment.expiresAt).toLocaleTimeString()}</p></div> : null}
              <div className="device-list" style={{ marginTop: 18 }}>
                {devices.length ? devices.map((device) => <div className="device-row" key={device.id}><span className="device-meta"><strong><span className={`status-dot${device.revokedAt ? " status-dot-revoked" : ""}`} />{device.name}</strong><span>{device.revokedAt ? `Revoked ${fullDate(device.revokedAt)}` : `Created ${fullDate(device.createdAt)} · ${device.permissions.join(", ")}`}</span></span>{device.revokedAt ? null : <button className="text-button" type="button" onClick={() => void revoke(device)} disabled={busy === device.id}>Revoke</button>}</div>) : <div className="empty-state"><div><strong>No phones authorized.</strong><p>Generate a one-time code when you are ready to connect one.</p></div></div>}
              </div>
            </div>
          </section>

          <section className="surface" aria-labelledby="rules-title">
            <div className="surface-header"><div><h2 id="rules-title">Learned rules</h2><p>Deterministic corrections used by category prediction.</p></div><Icon name="spark" className="icon-lg" /></div>
            <div className="surface-body">
              {rules.length ? <div className="rule-list">{rules.map((rule) => <div className="rule-row" key={rule.id}><span className="rule-meta"><strong>{rule.pattern}</strong><span>{rule.category.name} · priority {rule.priority}</span></span><button className="text-button" type="button" onClick={() => void apiFetch(`/api/rules/${rule.id}`, { method: "DELETE" }).then(() => load()).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to delete rule."))}>Delete</button></div>)}</div> : <div className="empty-state"><div><strong>No learned rules yet.</strong><p>Correct a prediction while capturing a transaction and the merchant relationship will appear here.</p></div></div>}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

export default function SettingsPage() {
  return <AuthGate><SettingsWorkspace /></AuthGate>;
}
