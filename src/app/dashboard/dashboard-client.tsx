"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { apiFetch, formatMoney, shortDate } from "@/lib/client";

type Transaction = {
  id: string;
  merchant: string;
  amountCents: number;
  direction: string;
  date: string;
  category: { id: string; name: string; color: string } | null;
  isSocial: boolean;
};

type Analytics = {
  totals: {
    totalIncome: number;
    totalExpenses: number;
    net: number;
    socialExpenses: number;
    socialPercentage: number;
    monthOverMonth: number | null;
  };
  months: Array<{ key: string; label: string; income: number; expenses: number; social: number }>;
  categoryBreakdown: Array<{ name: string; color: string; amountCents: number }>;
  socialByCategory: Array<{ name: string; color: string; amountCents: number }>;
  topMerchants: Array<{ merchant: string; amountCents: number; count: number }>;
  socialTopMerchants: Array<{ merchant: string; amountCents: number; count: number }>;
  recurring: Array<{
    merchant: string;
    amountCents: number;
    cadenceDays: number;
    occurrences: number;
    category: string;
  }>;
};

function initial(name: string) {
  return name.trim().slice(0, 1).toLocaleUpperCase("en-US") || "?";
}

export default function DashboardClient() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [analyticsData, transactionData] = await Promise.all([
        apiFetch<Analytics>("/api/analytics"),
        apiFetch<{ transactions: Transaction[] }>("/api/transactions?pageSize=8"),
      ]);
      setAnalytics(analyticsData);
      setTransactions(transactionData.transactions);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load the ledger.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const maxBar = useMemo(
    () => Math.max(...(analytics?.months.map((month) => Math.max(month.expenses, month.income)) ?? [1]), 1),
    [analytics],
  );
  const maxCategory = Math.max(...(analytics?.categoryBreakdown.map((item) => item.amountCents) ?? [1]), 1);

  return (
    <AppShell
      title="Your money, in motion."
      description="A route-aware view of the records you have chosen to keep."
      actions={
        <>
          <button className="button button-secondary" type="button" onClick={() => void load()} disabled={loading}>
            <Icon name="refresh" className="icon-sm" />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <Link className="button button-primary" href="/mobile">
            <Icon name="plus" className="icon-sm" />
            Quick capture
          </Link>
        </>
      }
    >
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {loading && !analytics ? (
        <div className="workspace-stack">
          <div className="metric-strip"><div className="loading-block" /><div className="loading-block" /><div className="loading-block" /><div className="loading-block" /></div>
          <div className="surface surface-body"><div className="loading-block" /></div>
        </div>
      ) : (
        <>
          <section className="metric-strip" aria-label="Financial summary">
            <div className="metric">
              <span className="metric-label">Six-month income</span>
              <strong className="metric-value">{formatMoney(analytics?.totals.totalIncome ?? 0)}</strong>
              <span className="metric-detail positive"><Icon name="arrow-up-right" className="icon-sm" /> Money in</span>
            </div>
            <div className="metric">
              <span className="metric-label">Six-month spend</span>
              <strong className="metric-value">{formatMoney(analytics?.totals.totalExpenses ?? 0)}</strong>
              <span className={`metric-detail${(analytics?.totals.monthOverMonth ?? 0) > 0 ? " negative" : " positive"}`}>
                {analytics?.totals.monthOverMonth === null || analytics?.totals.monthOverMonth === undefined
                  ? "No prior month yet"
                  : `${analytics.totals.monthOverMonth > 0 ? "+" : ""}${analytics.totals.monthOverMonth}% vs prior month`}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Net movement</span>
              <strong className="metric-value">{formatMoney(analytics?.totals.net ?? 0)}</strong>
              <span className={`metric-detail${(analytics?.totals.net ?? 0) >= 0 ? " positive" : " negative"}`}>
                {analytics?.totals.net !== undefined && analytics.totals.net >= 0 ? "Ahead of spend" : "Spend is ahead"}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Social spend</span>
              <strong className="metric-value">{formatMoney(analytics?.totals.socialExpenses ?? 0)}</strong>
              <span className="metric-detail"><Icon name="users" className="icon-sm" /> Tagged across categories</span>
            </div>
          </section>

          <div className="workspace-grid">
            <div className="workspace-stack">
              <section className="surface" aria-labelledby="cash-flow-title">
                <div className="surface-header">
                  <div>
                    <h2 id="cash-flow-title">Cash flow, month by month</h2>
                    <p>Income and expenses share one line so the direction stays visible.</p>
                  </div>
                </div>
                <div className="surface-body">
                  {analytics?.months.every((month) => month.income === 0 && month.expenses === 0) ? (
                    <div className="empty-state"><div><strong>Your first route starts here.</strong><p>Add a transaction to make the six-month view useful.</p></div></div>
                  ) : (
                    <>
                      <div className="trend-chart" aria-label="Monthly income and expense bars">
                        {analytics?.months.map((month) => (
                          <div className="chart-column" key={month.key}>
                            <div className="chart-bars">
                              <span className="bar bar-income" style={{ height: `${Math.max((month.income / maxBar) * 100, month.income ? 3 : 0)}%` }} title={`Income ${formatMoney(month.income)}`} />
                              <span className="bar bar-expense" style={{ height: `${Math.max((month.expenses / maxBar) * 100, month.expenses ? 3 : 0)}%` }} title={`Expenses ${formatMoney(month.expenses)}`} />
                            </div>
                            <span className="chart-label">{month.label}</span>
                          </div>
                        ))}
                      </div>
                      <div className="chart-legend">
                        <span><i className="legend-dot legend-dot-income" />Income</span>
                        <span><i className="legend-dot legend-dot-expense" />Expenses</span>
                      </div>
                    </>
                  )}
                </div>
              </section>

              <section className="surface" aria-labelledby="recent-title">
                <div className="surface-header">
                  <div>
                    <h2 id="recent-title">Recent transactions</h2>
                    <p>The latest stations on your ledger.</p>
                  </div>
                  <Link className="text-button" href="/transactions">View all</Link>
                </div>
                {transactions.length ? (
                  <div className="ledger-list">
                    {transactions.map((transaction) => (
                      <div className="ledger-row" key={transaction.id}>
                        <div className="ledger-main">
                          <span className="merchant-dot">{initial(transaction.merchant)}</span>
                          <span>
                            <span className="ledger-name">{transaction.merchant}</span>
                            <span className="ledger-subline">
                              <span className="category-pill">{transaction.category?.name ?? "Uncategorized"}</span>
                              {transaction.isSocial ? <span className="social-pill"><Icon name="users" className="icon-sm" /> Social</span> : null}
                            </span>
                          </span>
                        </div>
                        <span className="ledger-date">{shortDate(transaction.date)}</span>
                        <span className={`ledger-amount${transaction.direction === "income" ? " income" : ""}`}>
                          {formatMoney(transaction.amountCents, transaction.direction)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state"><div><strong>No transactions yet.</strong><p>Use Quick capture to add the first one.</p></div></div>
                )}
              </section>
            </div>

            <div className="workspace-stack">
              <section className="surface" aria-labelledby="social-title">
                <div className="surface-header">
                  <div>
                    <h2 id="social-title">The social line</h2>
                    <p>Social is a dimension, not a category.</p>
                  </div>
                  <Icon name="users" className="icon-lg" />
                </div>
                <div className="surface-body">
                  <strong className="metric-value">{formatMoney(analytics?.totals.socialExpenses ?? 0)}</strong>
                  <p className="muted">{analytics?.totals.socialPercentage ?? 0}% of tracked spend across the last six months</p>
                  <div className="insight-list">
                    {analytics?.socialByCategory.filter((item) => item.amountCents > 0).slice(0, 3).map((item) => (
                      <div className="insight-row" key={item.name}>
                        <span className="insight-label"><strong>{item.name}</strong><span>social category</span></span>
                        <span className="insight-value">{formatMoney(item.amountCents)}</span>
                      </div>
                    ))}
                  </div>
                  {analytics?.socialTopMerchants.length ? (
                    <div className="insight-list" style={{ marginTop: 12 }}>
                      {analytics.socialTopMerchants.slice(0, 3).map((item) => (
                        <div className="insight-row" key={`social-${item.merchant}`}>
                          <span className="insight-label"><strong>{item.merchant}</strong><span>{item.count} social transaction{item.count === 1 ? "" : "s"}</span></span>
                          <span className="insight-value">{formatMoney(item.amountCents)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="insight-list" style={{ marginTop: 12 }}>
                    {(analytics?.months ?? []).slice(-3).map((month) => (
                      <div className="insight-row" key={`social-month-${month.key}`}>
                        <span className="insight-label"><strong>{month.label}</strong><span>social by month</span></span>
                        <span className="insight-value">{formatMoney(month.social)}</span>
                      </div>
                    ))}
                  </div>
                  <Link className="button button-secondary" href="/transactions?social=true" style={{ marginTop: 15, width: "100%" }}>
                    Trace social transactions
                    <Icon name="arrow-up-right" className="icon-sm" />
                  </Link>
                </div>
              </section>

              <section className="surface" aria-labelledby="category-title">
                <div className="surface-header">
                  <div>
                    <h2 id="category-title">Where it goes</h2>
                    <p>Spend by category in the current view.</p>
                  </div>
                </div>
                <div className="surface-body">
                  {analytics?.categoryBreakdown.length ? (
                    <div className="breakdown-list">
                      {analytics.categoryBreakdown.slice(0, 6).map((item) => (
                        <div className="breakdown-item" key={item.name}>
                          <div className="breakdown-label"><span>{item.name}</span><strong>{formatMoney(item.amountCents)}</strong></div>
                          <div className="breakdown-track"><div className="breakdown-fill" style={{ width: `${(item.amountCents / maxCategory) * 100}%`, background: item.color }} /></div>
                        </div>
                      ))}
                    </div>
                  ) : <div className="empty-state"><div><strong>Categories will map here.</strong><p>Once the ledger has a few rows, this view will show its shape.</p></div></div>}
                </div>
              </section>

              <section className="surface" aria-labelledby="merchant-title">
                <div className="surface-header">
                  <div>
                    <h2 id="merchant-title">Top merchants</h2>
                    <p>Highest total spend in the current view.</p>
                  </div>
                  <Icon name="arrow-up-right" className="icon-lg" />
                </div>
                <div className="surface-body">
                  {analytics?.topMerchants.length ? (
                    <div className="insight-list">
                      {analytics.topMerchants.slice(0, 5).map((item) => (
                        <div className="insight-row" key={`merchant-${item.merchant}`}>
                          <span className="insight-label"><strong>{item.merchant}</strong><span>{item.count} transaction{item.count === 1 ? "" : "s"}</span></span>
                          <span className="insight-value">{formatMoney(item.amountCents)}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="empty-state"><div><strong>Merchant routes are empty.</strong><p>Top merchants appear once you have a few expense rows.</p></div></div>}
                </div>
              </section>

              <section className="surface" aria-labelledby="recurring-title">
                <div className="surface-header">
                  <div>
                    <h2 id="recurring-title">Likely recurring</h2>
                    <p>Signals, not promises.</p>
                  </div>
                  <Icon name="refresh" className="icon-lg" />
                </div>
                <div className="surface-body">
                  {analytics?.recurring.length ? (
                    <div className="insight-list">
                      {analytics.recurring.slice(0, 4).map((item) => (
                        <div className="insight-row" key={`${item.merchant}-${item.category}`}>
                          <span className="insight-label"><strong>{item.merchant}</strong><span>{item.category} · every ~{item.cadenceDays} days</span></span>
                          <span className="insight-value">{formatMoney(item.amountCents)}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="empty-state"><div><strong>No repeating routes yet.</strong><p>Recurring suggestions appear after a merchant shows a regular pattern.</p></div></div>}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
