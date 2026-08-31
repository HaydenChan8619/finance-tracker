import type { CSSProperties } from "react";

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <span className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function DashboardSkeleton() {
  return (
    <>
      {/* Top Level Metric Summary Strip Skeleton */}
      <section className="metric-strip" aria-label="Financial summary loading">
        {[1, 2, 3, 4].map((i) => (
          <div className="metric" key={i}>
            <span className="skeleton skeleton-text" style={{ width: "55%", height: 12, marginBottom: 9 }} />
            <span className="skeleton skeleton-title" style={{ width: "75%", height: 28, marginBottom: 8 }} />
            <span className="skeleton skeleton-pill" style={{ width: "45%", height: 16 }} />
          </div>
        ))}
      </section>

      <div className="workspace-grid">
        {/* Left Main Analytics Stack */}
        <div className="workspace-stack">
          {/* 1. Cash Flow & Monthly Spend Bar Chart Surface Skeleton */}
          <section className="surface chart-surface">
            <div className="surface-header">
              <span className="skeleton skeleton-title" style={{ width: 220, height: 20 }} />
              <div className="chart-header-badges">
                <span className="skeleton skeleton-pill" style={{ width: 110, height: 26 }} />
              </div>
            </div>
            <div className="surface-body">
              <div className="skeleton-chart-container">
                <div className="skeleton-chart-bars">
                  {[45, 75, 55, 90, 60, 40, 80, 65, 85, 70, 50, 65].map((height, idx) => (
                    <div className="skeleton-chart-col" key={idx}>
                      <div
                        className="skeleton skeleton-chart-col-bar"
                        style={{ height: `${height}%` }}
                      />
                      <span className="skeleton skeleton-chart-col-label" />
                    </div>
                  ))}
                </div>
                <div className="chart-legend" style={{ border: 0, marginTop: 4 }}>
                  <span className="skeleton skeleton-pill" style={{ width: 70, height: 24 }} />
                  <span className="skeleton skeleton-pill" style={{ width: 85, height: 24 }} />
                  <span className="skeleton skeleton-pill" style={{ width: 65, height: 24 }} />
                  <span className="skeleton skeleton-pill" style={{ width: 90, height: 24 }} />
                </div>
              </div>
            </div>
          </section>

          {/* 2. Spend Distribution Surface Skeleton */}
          <section className="surface distribution-surface">
            <div className="surface-header">
              <span className="skeleton skeleton-title" style={{ width: 200, height: 20 }} />
              <div className="tab-segmented-control" style={{ opacity: 0.6 }}>
                <span className="skeleton" style={{ width: 96, height: 28, borderRadius: 6 }} />
                <span className="skeleton" style={{ width: 96, height: 28, borderRadius: 6 }} />
                <span className="skeleton" style={{ width: 96, height: 28, borderRadius: 6 }} />
              </div>
            </div>
            <div className="surface-body">
              <div className="skeleton-donut-layout">
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <div className="skeleton skeleton-donut-ring" />
                </div>
                <div>
                  {[
                    { width: "75%", pct: "75%" },
                    { width: "60%", pct: "50%" },
                    { width: "50%", pct: "35%" },
                    { width: "65%", pct: "60%" },
                  ].map((row, idx) => (
                    <div className="skeleton-progress-row" key={idx}>
                      <div className="skeleton-progress-header">
                        <span className="skeleton skeleton-text" style={{ width: row.width, height: 13 }} />
                        <span className="skeleton skeleton-text" style={{ width: 45, height: 13 }} />
                      </div>
                      <div className="skeleton" style={{ height: 8, width: "100%", borderRadius: 4 }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 3. Recent Activity Surface Skeleton */}
          <section className="surface">
            <div className="surface-header">
              <span className="skeleton skeleton-title" style={{ width: 140, height: 20 }} />
              <span className="skeleton skeleton-pill" style={{ width: 80, height: 26 }} />
            </div>
            <div className="surface-body">
              <div className="ledger-list">
                {[1, 2, 3, 4].map((i) => (
                  <div className="ledger-row" key={i} style={{ borderBottom: "1px solid var(--line)", padding: "12px 0" }}>
                    <div className="ledger-main">
                      <div className="skeleton skeleton-circle" style={{ width: 28, height: 28 }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <span className="skeleton skeleton-text" style={{ width: 130 + (i % 3) * 30, height: 14 }} />
                        <span className="skeleton skeleton-pill" style={{ width: 65, height: 16 }} />
                      </div>
                    </div>
                    <span className="skeleton skeleton-text" style={{ width: 70, height: 13 }} />
                    <span className="skeleton skeleton-text" style={{ width: 65, height: 16 }} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Right Secondary Stack */}
        <div className="workspace-stack">
          {/* Social Lens Card Skeleton */}
          <section className="surface">
            <div className="surface-header">
              <span className="skeleton skeleton-title" style={{ width: 120, height: 20 }} />
              <span className="skeleton skeleton-circle" style={{ width: 20, height: 20 }} />
            </div>
            <div className="surface-body">
              <span className="skeleton skeleton-title" style={{ width: 140, height: 28, marginBottom: 8 }} />
              <span className="skeleton skeleton-text" style={{ width: "90%", height: 13, marginBottom: 16 }} />
              <div className="insight-list">
                {[1, 2, 3].map((i) => (
                  <div className="insight-row" key={i}>
                    <span className="insight-label">
                      <span className="skeleton skeleton-text" style={{ width: 90, height: 14, marginBottom: 4 }} />
                      <span className="skeleton skeleton-text" style={{ width: 60, height: 11 }} />
                    </span>
                    <span className="skeleton skeleton-text" style={{ width: 55, height: 15 }} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Top Merchants Card Skeleton */}
          <section className="surface">
            <div className="surface-header">
              <span className="skeleton skeleton-title" style={{ width: 110, height: 20 }} />
              <span className="skeleton skeleton-circle" style={{ width: 20, height: 20 }} />
            </div>
            <div className="surface-body">
              <div className="insight-list">
                {[1, 2, 3, 4].map((i) => (
                  <div className="insight-row" key={i}>
                    <span className="insight-label">
                      <span className="skeleton skeleton-text" style={{ width: 110 + (i % 3) * 20, height: 14, marginBottom: 4 }} />
                      <span className="skeleton skeleton-text" style={{ width: 80, height: 11 }} />
                    </span>
                    <span className="skeleton skeleton-text" style={{ width: 60, height: 15 }} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Likely Recurring Card Skeleton */}
          <section className="surface">
            <div className="surface-header">
              <span className="skeleton skeleton-title" style={{ width: 120, height: 20 }} />
              <span className="skeleton skeleton-circle" style={{ width: 20, height: 20 }} />
            </div>
            <div className="surface-body">
              <div className="insight-list">
                {[1, 2, 3].map((i) => (
                  <div className="insight-row" key={i}>
                    <span className="insight-label">
                      <span className="skeleton skeleton-text" style={{ width: 100 + (i % 2) * 30, height: 14, marginBottom: 4 }} />
                      <span className="skeleton skeleton-text" style={{ width: 120, height: 11 }} />
                    </span>
                    <span className="skeleton skeleton-text" style={{ width: 55, height: 15 }} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export function TransactionsTableSkeleton() {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Merchant</th>
            <th>Date</th>
            <th>Category</th>
            <th>Amount</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, idx) => (
            <tr key={idx}>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span className="skeleton skeleton-text" style={{ width: `${110 + (idx % 4) * 25}px`, height: 15 }} />
                  {idx % 3 === 0 ? <span className="skeleton skeleton-pill" style={{ width: 50, height: 18 }} /> : null}
                  {idx % 5 === 0 ? <span className="skeleton skeleton-pill" style={{ width: 50, height: 18 }} /> : null}
                </div>
              </td>
              <td><span className="skeleton skeleton-text mono" style={{ width: 85, height: 14 }} /></td>
              <td><span className="skeleton skeleton-pill" style={{ width: `${65 + (idx % 3) * 15}px`, height: 22 }} /></td>
              <td><span className="skeleton skeleton-text mono" style={{ width: 70, height: 15 }} /></td>
              <td>
                <div className="table-actions" style={{ opacity: 0.5 }}>
                  <span className="skeleton skeleton-text" style={{ width: 28, height: 14 }} />
                  <span className="skeleton skeleton-text" style={{ width: 38, height: 14 }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="settings-grid">
      {/* Categories Surface */}
      <section className="surface">
        <div className="surface-header">
          <span className="skeleton skeleton-title" style={{ width: 110, height: 20 }} />
          <span className="skeleton skeleton-circle" style={{ width: 20, height: 20 }} />
        </div>
        <div className="surface-body">
          <div className="category-builder-form" style={{ marginBottom: 18 }}>
            <span className="skeleton skeleton-input" style={{ width: "100%", height: 38 }} />
            <span className="skeleton skeleton-btn" style={{ width: 120, height: 38 }} />
          </div>
          <div className="category-tags-grid" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <span key={i} className="skeleton skeleton-pill" style={{ width: 85 + (i % 4) * 15, height: 30 }} />
            ))}
          </div>
        </div>
      </section>

      {/* Authorized Phones Surface */}
      <section className="surface">
        <div className="surface-header">
          <span className="skeleton skeleton-title" style={{ width: 140, height: 20 }} />
          <span className="skeleton skeleton-circle" style={{ width: 20, height: 20 }} />
        </div>
        <div className="surface-body">
          <div className="device-builder-form" style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            <span className="skeleton skeleton-input" style={{ flex: 1, height: 38 }} />
            <span className="skeleton skeleton-btn" style={{ width: 130, height: 38 }} />
          </div>
          <div className="device-list" style={{ marginTop: 18 }}>
            {[1, 2].map((i) => (
              <div className="device-row" key={i}>
                <span className="device-meta">
                  <span className="skeleton skeleton-text" style={{ width: 120, height: 15, marginBottom: 4 }} />
                  <span className="skeleton skeleton-text" style={{ width: 180, height: 12 }} />
                </span>
                <span className="skeleton skeleton-text" style={{ width: 45, height: 14 }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Learned Rules Surface */}
      <section className="surface">
        <div className="surface-header">
          <span className="skeleton skeleton-title" style={{ width: 120, height: 20 }} />
          <span className="skeleton skeleton-circle" style={{ width: 20, height: 20 }} />
        </div>
        <div className="surface-body">
          <div className="rule-list">
            {[1, 2, 3].map((i) => (
              <div className="rule-row" key={i}>
                <span className="rule-meta">
                  <span className="skeleton skeleton-text" style={{ width: 130, height: 15, marginBottom: 4 }} />
                  <span className="skeleton skeleton-text" style={{ width: 160, height: 12 }} />
                </span>
                <span className="skeleton skeleton-text" style={{ width: 40, height: 14 }} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export function ImportHistorySkeleton() {
  return (
    <div className="ledger-list">
      {[1, 2, 3].map((i) => (
        <div className="ledger-row" key={i} style={{ borderBottom: "1px solid var(--line)", padding: "12px 0", pointerEvents: "none" }}>
          <span className="ledger-main">
            <span className="skeleton skeleton-circle" style={{ width: 28, height: 28 }} />
            <span style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="skeleton skeleton-text" style={{ width: 140 + (i % 2) * 40, height: 14 }} />
                <span className="skeleton skeleton-pill" style={{ width: 36, height: 18 }} />
              </span>
              <span className="skeleton skeleton-text" style={{ width: 120, height: 11 }} />
            </span>
          </span>
          <span className="skeleton skeleton-text" style={{ width: 80, height: 13 }} />
          <span className="skeleton skeleton-pill" style={{ width: 55, height: 20 }} />
        </div>
      ))}
    </div>
  );
}
