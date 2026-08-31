"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Topbar from "@/components/topbar";
import { DashboardSkeleton } from "@/components/skeletons";
import { Icon, getCategoryIconName } from "@/components/icon";
import { apiFetch, formatMoney, shortDate } from "@/lib/client";

type Transaction = {
  id: string;
  merchant: string;
  amountCents: number;
  direction: string;
  date: string;
  category: { id: string; name: string; color: string } | null;
  isSocial: boolean;
  isDating: boolean;
};

type MonthCategoryExpense = {
  id: string;
  name: string;
  color: string;
  amountCents: number;
};

type MonthData = {
  key: string;
  label: string;
  income: number;
  expenses: number;
  social: number;
  expensesByCategory?: MonthCategoryExpense[];
};

type Analytics = {
  totals: {
    totalIncome: number;
    totalExpenses: number;
    net: number;
    socialExpenses: number;
    datingExpenses?: number;
    socialPercentage: number;
    datingPercentage?: number;
    monthOverMonth: number | null;
    averageMonthlyExpense?: number;
    activeMonthsCount?: number;
  };
  months: MonthData[];
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

function formatCompactMoney(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  if (dollars >= 1000) {
    const formatted = (dollars / 1000).toFixed(dollars >= 10000 ? 0 : 1).replace(/\.0$/, "");
    return `$${formatted}k`;
  }
  return `$${Math.round(dollars)}`;
}

// Polar to Cartesian conversion for SVG Arcs
function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

// Generate SVG Donut arc path with inner and outer radius
function describeArc(x: number, y: number, radius: number, innerRadius: number, startAngle: number, endAngle: number) {
  const sweep = endAngle - startAngle;
  const clampedEnd = sweep >= 360 ? startAngle + 359.999 : endAngle;
  const start = polarToCartesian(x, y, radius, clampedEnd);
  const end = polarToCartesian(x, y, radius, startAngle);
  const innerStart = polarToCartesian(x, y, innerRadius, clampedEnd);
  const innerEnd = polarToCartesian(x, y, innerRadius, startAngle);
  const largeArcFlag = clampedEnd - startAngle <= 180 ? "0" : "1";

  return [
    "M", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
    "L", innerEnd.x, innerEnd.y,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 1, innerStart.x, innerStart.y,
    "Z",
  ].join(" ");
}

export default function DashboardClient() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Interactive Chart States
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [hoveredMonthKey, setHoveredMonthKey] = useState<string | null>(null);
  const [distributionTab, setDistributionTab] = useState<"category" | "lifestyle" | "monthly">("category");
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [hoveredLifestyle, setHoveredLifestyle] = useState<string | null>(null);
  const [isIncomeHidden, setIsIncomeHidden] = useState(false);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());

  const toggleIncome = useCallback(() => {
    setIsIncomeHidden((prev) => !prev);
  }, []);

  const toggleCategory = useCallback((categoryName: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryName)) {
        next.delete(categoryName);
      } else {
        next.add(categoryName);
      }
      return next;
    });
  }, []);

  const showAllSeries = useCallback(() => {
    setIsIncomeHidden(false);
    setHiddenCategories(new Set());
  }, []);

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

  // Max value calculation for bar chart height scale (accounting for toggled series)
  const maxBar = useMemo(() => {
    if (!analytics?.months?.length) return 1;
    const maxVal = Math.max(
      ...analytics.months.map((m) => {
        const visibleIncome = isIncomeHidden ? 0 : m.income;
        const visibleExpense = m.expensesByCategory
          ? m.expensesByCategory
              .filter((c) => !hiddenCategories.has(c.name))
              .reduce((sum, c) => sum + c.amountCents, 0)
          : (hiddenCategories.size > 0 ? 0 : m.expenses);
        return Math.max(visibleIncome, visibleExpense);
      })
    );
    return maxVal > 0 ? maxVal : 1;
  }, [analytics, isIncomeHidden, hiddenCategories]);

  const maxCategory = useMemo(() => {
    if (!analytics?.categoryBreakdown?.length) return 1;
    const maxVal = Math.max(...analytics.categoryBreakdown.map((item) => item.amountCents));
    return maxVal > 0 ? maxVal : 1;
  }, [analytics]);

  // Active month inspection data (hovered or pinned)
  const activeMonthKey = hoveredMonthKey || selectedMonthKey;
  const activeMonth = useMemo(() => {
    if (!analytics?.months?.length) return null;
    if (activeMonthKey) {
      return analytics.months.find((m) => m.key === activeMonthKey) || null;
    }
    // Default to the latest active month with spending
    return (
      [...analytics.months].reverse().find((m) => m.expenses > 0 || m.income > 0) ||
      analytics.months[analytics.months.length - 1] ||
      null
    );
  }, [analytics, activeMonthKey]);

  const activeMonthVisibleCategories = useMemo(() => {
    if (!activeMonth?.expensesByCategory) return [];
    return activeMonth.expensesByCategory.filter((cat) => !hiddenCategories.has(cat.name));
  }, [activeMonth, hiddenCategories]);

  const activeMonthVisibleExpense = useMemo(() => {
    if (!activeMonth) return 0;
    if (activeMonth.expensesByCategory) {
      return activeMonthVisibleCategories.reduce((sum, cat) => sum + cat.amountCents, 0);
    }
    return hiddenCategories.size > 0 ? 0 : activeMonth.expenses;
  }, [activeMonth, activeMonthVisibleCategories, hiddenCategories]);

  const activeMonthVisibleIncome = isIncomeHidden ? 0 : (activeMonth?.income ?? 0);
  const activeMonthNet = activeMonthVisibleIncome - activeMonthVisibleExpense;

  // Calculate lifestyle split data (Social vs Solo vs Dating)
  const lifestyleData = useMemo(() => {
    if (!analytics) return [];
    const totalExp = analytics.totals.totalExpenses || 0;
    const socialExp = analytics.totals.socialExpenses || 0;
    const datingExp = analytics.totals.datingExpenses || 0;
    const soloExp = Math.max(0, totalExp - socialExp - datingExp);

    const items: Array<{
      id: string;
      name: string;
      amountCents: number;
      color: string;
      icon: "user" | "users" | "heart";
      description: string;
    }> = [
      {
        id: "solo",
        name: "Solo & Essentials",
        amountCents: soloExp,
        color: "#287d72",
        icon: "user",
        description: "Personal living, solo groceries, transport, utilities & subscriptions",
      },
      {
        id: "social",
        name: "Social Spend",
        amountCents: socialExp,
        color: "#de754b",
        icon: "users",
        description: "Dining out with friends, shared rides, drinks, events & group outings",
      },
    ];

    if (datingExp > 0) {
      items.push({
        id: "dating",
        name: "Dating",
        amountCents: datingExp,
        color: "#b03a74",
        icon: "heart",
        description: "Dates, romantic dinners & shared partner experiences",
      });
    }

    return items.filter((item) => item.amountCents > 0);
  }, [analytics]);

  // Donut slices for category breakdown
  const categorySlices = useMemo(() => {
    if (!analytics?.categoryBreakdown?.length) return [];
    const valid = analytics.categoryBreakdown.filter((c) => c.amountCents > 0);
    const total = valid.reduce((sum, c) => sum + c.amountCents, 0);
    if (total === 0) return [];

    let currentAngle = 0;
    return valid.map((cat) => {
      const percentage = (cat.amountCents / total) * 100;
      const angle = (cat.amountCents / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle += angle;

      return {
        id: cat.name,
        name: cat.name,
        amountCents: cat.amountCents,
        color: cat.color || "#64748b",
        percentage,
        startAngle,
        endAngle,
      };
    });
  }, [analytics]);

  // Donut slices for lifestyle split
  const lifestyleSlices = useMemo(() => {
    const total = lifestyleData.reduce((sum, item) => sum + item.amountCents, 0);
    if (total === 0) return [];

    let currentAngle = 0;
    return lifestyleData.map((item) => {
      const percentage = (item.amountCents / total) * 100;
      const angle = (item.amountCents / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle += angle;

      return {
        id: item.id,
        name: item.name,
        amountCents: item.amountCents,
        color: item.color,
        percentage,
        startAngle,
        endAngle,
      };
    });
  }, [lifestyleData]);

  // Average monthly expense computation
  const averageMonthlySpend = useMemo(() => {
    if (!analytics) return 0;
    if (analytics.totals.averageMonthlyExpense !== undefined) {
      return analytics.totals.averageMonthlyExpense;
    }
    const nonZeroMonths = analytics.months.filter((m) => m.expenses > 0);
    return nonZeroMonths.length ? Math.round(analytics.totals.totalExpenses / nonZeroMonths.length) : 0;
  }, [analytics]);

  return (
    <>
      <Topbar
        title="Dashboard"
        actions={
          <>
            <button className="button button-secondary" type="button" onClick={() => void load()} disabled={loading}>
              <Icon name="refresh" className="icon-sm" />
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <Link className="button button-primary" href="/mobile">
              <Icon name="plus" className="icon-sm" />
              Add
            </Link>
          </>
        }
      />
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {loading && !analytics ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Top Level Metric Summary Strip */}
          <section className="metric-strip" aria-label="Financial summary">
            <div className="metric">
              <span className="metric-label">12-Month Income</span>
              <strong className="metric-value">{formatMoney(analytics?.totals.totalIncome ?? 0)}</strong>
              <span className="metric-detail positive">
                <Icon name="arrow-up-right" className="icon-sm" /> Money in
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">12-Month Spend</span>
              <strong className="metric-value">{formatMoney(analytics?.totals.totalExpenses ?? 0)}</strong>
              <span className={`metric-detail${(analytics?.totals.monthOverMonth ?? 0) > 0 ? " negative" : " positive"}`}>
                {analytics?.totals.monthOverMonth === null || analytics?.totals.monthOverMonth === undefined
                  ? "No prior month yet"
                  : `${analytics.totals.monthOverMonth > 0 ? "+" : ""}${analytics.totals.monthOverMonth}% vs prior month`}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Net Movement</span>
              <strong className="metric-value">{formatMoney(analytics?.totals.net ?? 0)}</strong>
              <span className={`metric-detail${(analytics?.totals.net ?? 0) >= 0 ? " positive" : " negative"}`}>
                {analytics?.totals.net !== undefined && analytics.totals.net >= 0 ? "Ahead of spend" : "Spend is ahead"}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Social Spend</span>
              <strong className="metric-value">{formatMoney(analytics?.totals.socialExpenses ?? 0)}</strong>
              <span className="metric-detail">
                <Icon name="users" className="icon-sm" /> {analytics?.totals.socialPercentage ?? 0}% across categories
              </span>
            </div>
          </section>

          <div className="workspace-grid">
            {/* Left Main Analytics Stack */}
            <div className="workspace-stack">

              {/* 1. Cash Flow & Monthly Spend Bar Chart */}
              <section className="surface chart-surface" aria-labelledby="cash-flow-title">
                <div className="surface-header">
                  <div>
                    <h2 id="cash-flow-title">Cash flow &amp; monthly spending</h2>
                  </div>
                  <div className="chart-header-badges">
                    {selectedMonthKey ? (
                      <button
                        className="badge-button"
                        type="button"
                        onClick={() => setSelectedMonthKey(null)}
                        title="Click to reset month focus"
                      >
                        <span>Focused: <strong>{activeMonth?.label}</strong></span>
                        <Icon name="x" className="icon-sm" />
                      </button>
                    ) : null}
                    <div className="summary-pill">
                      <span>Avg:</span>
                      <strong>{formatMoney(averageMonthlySpend)}/mo</strong>
                    </div>
                  </div>
                </div>

                <div className="surface-body">
                  {analytics?.months.every((month) => month.income === 0 && month.expenses === 0) ? (
                    <div className="empty-state">
                      <div>
                        <strong>Your first route starts here.</strong>
                        <p>Add a transaction to make the 12-month view useful.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Active Month Live Inspector Popover */}
                      {activeMonth ? (
                        <div className="chart-inspector-card" role="region" aria-label="Month details">
                          <div className="inspector-head">
                            <div className="inspector-title">
                              <span className="inspector-month">{activeMonth.label}</span>
                              <span className="inspector-key">{activeMonth.key}</span>
                            </div>
                            <div className="inspector-stats">
                              <div className="inspector-stat">
                                <span className="stat-name">Spent:</span>
                                <strong className="stat-val expense-val">{formatMoney(activeMonthVisibleExpense)}</strong>
                              </div>
                              <div className="inspector-stat">
                                <span className="stat-name">Income:</span>
                                <strong className={`stat-val income-val${isIncomeHidden ? " muted" : ""}`}>{formatMoney(activeMonthVisibleIncome)}</strong>
                              </div>
                              <div className="inspector-stat">
                                <span className="stat-name">Net:</span>
                                <strong className={`stat-val ${activeMonthNet >= 0 ? "income-val" : "expense-val"}`}>
                                  {formatMoney(activeMonthNet)}
                                </strong>
                              </div>
                            </div>
                          </div>
                          {activeMonthVisibleCategories.length > 0 ? (
                            <div className="inspector-categories">
                              {activeMonthVisibleCategories.slice(0, 5).map((cat) => (
                                <span key={cat.id || cat.name} className="inspector-cat-pill">
                                  <i className="cat-color-dot" style={{ backgroundColor: cat.color }} />
                                  <span className="cat-name">{cat.name}</span>
                                  <strong className="cat-amt">{formatMoney(cat.amountCents)}</strong>
                                </span>
                              ))}
                              {activeMonthVisibleCategories.length > 5 ? (
                                <span className="inspector-more-pill">+{activeMonthVisibleCategories.length - 5} more</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Bar Chart Container with Background Scale Lines */}
                      <div className="chart-canvas-container">
                        <div className="chart-grid-scale" aria-hidden="true">
                          <div className="grid-line top-line"><span>{formatCompactMoney(maxBar)}</span></div>
                          <div className="grid-line mid-line"><span>{formatCompactMoney(Math.round(maxBar / 2))}</span></div>
                          <div className="grid-line base-line"><span>$0</span></div>
                        </div>

                        <div className="trend-chart" aria-label="Monthly income and stacked expense bars">
                          {analytics?.months.map((month) => {
                            const isSelected = selectedMonthKey === month.key;
                            const isHovered = hoveredMonthKey === month.key;
                            const isActive = isSelected || isHovered;
                            const visibleCategoryExpenses = (month.expensesByCategory || []).filter(
                              (cat) => !hiddenCategories.has(cat.name)
                            );
                            const visibleExpense = month.expensesByCategory
                              ? visibleCategoryExpenses.reduce((sum, cat) => sum + cat.amountCents, 0)
                              : (hiddenCategories.size > 0 ? 0 : month.expenses);
                            const visibleIncome = isIncomeHidden ? 0 : month.income;

                            const incomeHeight = Math.max((visibleIncome / maxBar) * 100, visibleIncome ? 4 : 0);
                            const expenseHeight = Math.max((visibleExpense / maxBar) * 100, visibleExpense ? 4 : 0);

                            return (
                              <div
                                className={`chart-column${isActive ? " is-active" : ""}`}
                                key={month.key}
                                onMouseEnter={() => setHoveredMonthKey(month.key)}
                                onMouseLeave={() => setHoveredMonthKey(null)}
                                onClick={() => setSelectedMonthKey(selectedMonthKey === month.key ? null : month.key)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    setSelectedMonthKey(selectedMonthKey === month.key ? null : month.key);
                                  }
                                }}
                                aria-label={`${month.label}: Spent ${formatMoney(visibleExpense)}, Income ${formatMoney(visibleIncome)}`}
                              >
                                <div className="chart-bars">
                                  {/* Income Bar */}
                                  {!isIncomeHidden && (
                                    <span
                                      className="bar bar-income"
                                      style={{
                                        height: `${incomeHeight}%`,
                                        opacity: visibleIncome > 0 ? 1 : 0,
                                        minHeight: visibleIncome > 0 ? undefined : 0,
                                      }}
                                      title={`Income: ${formatMoney(month.income)}`}
                                    />
                                  )}
                                  {/* Stacked Expense Bar */}
                                  {(visibleExpense > 0 || !hiddenCategories.size) && (
                                    <div
                                      className="bar-stacked-expense"
                                      style={{
                                        height: `${expenseHeight}%`,
                                        opacity: visibleExpense > 0 ? 1 : 0,
                                        minHeight: visibleExpense > 0 ? undefined : 0,
                                      }}
                                      title={`Spend: ${formatMoney(visibleExpense)}`}
                                    >
                                      {visibleCategoryExpenses.length > 0 ? (
                                        visibleCategoryExpenses.map((cat) => (
                                          <span
                                            key={cat.id || cat.name}
                                            className={`bar-segment${hoveredCategory === cat.name ? " is-highlighted" : ""}`}
                                            style={{
                                              height: `${visibleExpense > 0 ? (cat.amountCents / visibleExpense) * 100 : 0}%`,
                                              backgroundColor: cat.color || "var(--signal)",
                                            }}
                                            title={`${cat.name}: ${formatMoney(cat.amountCents)}`}
                                          />
                                        ))
                                      ) : (
                                        <span
                                          className="bar-segment"
                                          style={{ height: "100%", backgroundColor: "var(--signal)" }}
                                          title={`Spend: ${formatMoney(visibleExpense)}`}
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Month Spend Badge (Clear Month-by-Month Spend visibility) */}
                                <div className="chart-spend-pill" title={`Total spent in ${month.label}: ${formatMoney(visibleExpense)}`}>
                                  {formatCompactMoney(visibleExpense)}
                                </div>

                                {/* Month Name Label */}
                                <span className="chart-label">{month.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Interactive Chart Legend */}
                      <div className="chart-legend" role="toolbar" aria-label="Toggle chart series">
                        <button
                          type="button"
                          className={`legend-item legend-toggle-btn${isIncomeHidden ? " is-disabled" : ""}`}
                          onClick={toggleIncome}
                          aria-pressed={!isIncomeHidden}
                          title={isIncomeHidden ? "Click to show Income on graph" : "Click to hide Income on graph"}
                        >
                          <i className="legend-dot legend-dot-income" />
                          <span>Income</span>
                        </button>
                        {analytics?.categoryBreakdown.filter((c) => c.amountCents > 0).map((cat) => {
                          const isHidden = hiddenCategories.has(cat.name);
                          const isHovered = hoveredCategory === cat.name;
                          return (
                            <button
                              key={cat.name}
                              type="button"
                              className={`legend-item legend-toggle-btn${isHovered ? " is-highlighted" : ""}${isHidden ? " is-disabled" : ""}`}
                              onClick={() => toggleCategory(cat.name)}
                              onMouseEnter={() => setHoveredCategory(cat.name)}
                              onMouseLeave={() => setHoveredCategory(null)}
                              aria-pressed={!isHidden}
                              title={isHidden ? `Click to show ${cat.name} on graph` : `Click to hide ${cat.name} on graph`}
                            >
                              <i className="legend-dot" style={{ backgroundColor: cat.color }} />
                              <span>{cat.name}</span>
                            </button>
                          );
                        })}
                        {isIncomeHidden || hiddenCategories.size > 0 ? (
                          <button
                            type="button"
                            className="legend-reset-btn"
                            onClick={showAllSeries}
                            title="Show all series on graph"
                          >
                            <Icon name="refresh" className="icon-xs" />
                            <span>Show all</span>
                          </button>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* 2. Spend Distribution & Intelligence (Revamped Red Box Space) */}
              <section className="surface distribution-surface" aria-labelledby="distribution-title">
                <div className="surface-header">
                  <div>
                    <h2 id="distribution-title">Spend distribution &amp; intelligence</h2>
                  </div>

                  {/* View Segmented Tabs */}
                  <div className="tab-segmented-control" role="tablist" aria-label="Spend distribution views">
                    <button
                      className={`tab-segment-btn${distributionTab === "category" ? " active" : ""}`}
                      type="button"
                      role="tab"
                      aria-selected={distributionTab === "category"}
                      onClick={() => setDistributionTab("category")}
                    >
                      <Icon name="pie-chart" className="icon-sm" />
                      <span>Category Pie</span>
                    </button>
                    <button
                      className={`tab-segment-btn${distributionTab === "lifestyle" ? " active" : ""}`}
                      type="button"
                      role="tab"
                      aria-selected={distributionTab === "lifestyle"}
                      onClick={() => setDistributionTab("lifestyle")}
                    >
                      <Icon name="users" className="icon-sm" />
                      <span>Lifestyle Split</span>
                    </button>
                    <button
                      className={`tab-segment-btn${distributionTab === "monthly" ? " active" : ""}`}
                      type="button"
                      role="tab"
                      aria-selected={distributionTab === "monthly"}
                      onClick={() => setDistributionTab("monthly")}
                    >
                      <Icon name="calendar" className="icon-sm" />
                      <span>Monthly Table</span>
                    </button>
                  </div>
                </div>

                <div className="surface-body">
                  {/* TAB 1: CATEGORY PIE / DONUT VIEW */}
                  {distributionTab === "category" ? (
                    categorySlices.length === 0 ? (
                      <div className="empty-state">
                        <div>
                          <strong>No category spend data available.</strong>
                          <p>Record transactions to see your spending distribution by category.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="donut-layout-grid">
                        {/* SVG Donut Chart with Center Dynamic Readout */}
                        <div className="donut-chart-wrapper">
                          <svg
                            viewBox="0 0 240 240"
                            className="donut-svg"
                            role="img"
                            aria-label="Category spending distribution donut chart"
                          >
                            <defs>
                              <filter id="slice-shadow" x="-10%" y="-10%" width="120%" height="120%">
                                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.18" />
                              </filter>
                            </defs>
                            <g transform="translate(120, 120)">
                              {categorySlices.map((slice) => {
                                const isHovered = hoveredCategory === slice.name;
                                const pathD = describeArc(
                                  0,
                                  0,
                                  isHovered ? 104 : 98,
                                  isHovered ? 64 : 68,
                                  slice.startAngle,
                                  slice.endAngle,
                                );
                                return (
                                  <path
                                    key={slice.id}
                                    d={pathD}
                                    fill={slice.color}
                                    stroke="var(--surface)"
                                    strokeWidth="2"
                                    className={`donut-path${isHovered ? " is-hovered" : ""}`}
                                    filter={isHovered ? "url(#slice-shadow)" : undefined}
                                    onMouseEnter={() => setHoveredCategory(slice.name)}
                                    onMouseLeave={() => setHoveredCategory(null)}
                                  >
                                    <title>{`${slice.name}: ${formatMoney(slice.amountCents)} (${slice.percentage.toFixed(1)}%)`}</title>
                                  </path>
                                );
                              })}
                            </g>
                          </svg>

                          {/* Dynamic Center Readout */}
                          <div className="donut-center-content" aria-live="polite">
                            {hoveredCategory ? (
                              (() => {
                                const target = categorySlices.find((s) => s.name === hoveredCategory);
                                return (
                                  <>
                                    <span className="donut-center-tag" style={{ color: target?.color }}>{hoveredCategory}</span>
                                    <strong className="donut-center-amt">{formatMoney(target?.amountCents ?? 0)}</strong>
                                    <span className="donut-center-sub">{target?.percentage.toFixed(1)}% of spend</span>
                                  </>
                                );
                              })()
                            ) : (
                              <>
                                <span className="donut-center-tag">12-Month Total</span>
                                <strong className="donut-center-amt">{formatMoney(analytics?.totals.totalExpenses ?? 0)}</strong>
                                <span className="donut-center-sub">{categorySlices.length} categories</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Category List & Progress Tracks */}
                        <div className="donut-details-list">
                          <div className="details-header-row">
                            <span className="col-label">Category</span>
                            <span className="col-label text-right">Total &amp; Share</span>
                          </div>
                          <div className="category-items-scroll">
                            {categorySlices.map((cat) => {
                              const isHovered = hoveredCategory === cat.name;
                              const iconName = getCategoryIconName(cat.name);
                              return (
                                <div
                                  className={`category-item-card${isHovered ? " is-hovered" : ""}`}
                                  key={cat.name}
                                  onMouseEnter={() => setHoveredCategory(cat.name)}
                                  onMouseLeave={() => setHoveredCategory(null)}
                                >
                                  <div className="item-main">
                                    <span className="cat-icon-badge" style={{ backgroundColor: `${cat.color}1a`, color: cat.color }}>
                                      <Icon name={iconName} className="icon-sm" />
                                    </span>
                                    <div className="item-text">
                                      <span className="item-title">{cat.name}</span>
                                      <div className="item-track">
                                        <div
                                          className="item-fill"
                                          style={{ width: `${(cat.amountCents / maxCategory) * 100}%`, backgroundColor: cat.color }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  <div className="item-values">
                                    <strong className="item-amount">{formatMoney(cat.amountCents)}</strong>
                                    <span className="item-percent">{cat.percentage.toFixed(1)}%</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  ) : null}

                  {/* TAB 2: LIFESTYLE SPLIT (Social vs Solo vs Dating) */}
                  {distributionTab === "lifestyle" ? (
                    lifestyleSlices.length === 0 ? (
                      <div className="empty-state">
                        <div>
                          <strong>No lifestyle data recorded.</strong>
                          <p>Tag transactions with Social or Dating to analyze lifestyle distribution.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="lifestyle-layout-grid">
                        {/* Lifestyle Donut Chart */}
                        <div className="donut-chart-wrapper">
                          <svg viewBox="0 0 240 240" className="donut-svg" role="img" aria-label="Lifestyle distribution donut chart">
                            <g transform="translate(120, 120)">
                              {lifestyleSlices.map((slice) => {
                                const isHovered = hoveredLifestyle === slice.id;
                                const pathD = describeArc(
                                  0,
                                  0,
                                  isHovered ? 104 : 98,
                                  isHovered ? 64 : 68,
                                  slice.startAngle,
                                  slice.endAngle,
                                );
                                return (
                                  <path
                                    key={slice.id}
                                    d={pathD}
                                    fill={slice.color}
                                    stroke="var(--surface)"
                                    strokeWidth="2"
                                    className={`donut-path${isHovered ? " is-hovered" : ""}`}
                                    onMouseEnter={() => setHoveredLifestyle(slice.id)}
                                    onMouseLeave={() => setHoveredLifestyle(null)}
                                  >
                                    <title>{`${slice.name}: ${formatMoney(slice.amountCents)} (${slice.percentage.toFixed(1)}%)`}</title>
                                  </path>
                                );
                              })}
                            </g>
                          </svg>

                          <div className="donut-center-content" aria-live="polite">
                            {hoveredLifestyle ? (
                              (() => {
                                const target = lifestyleSlices.find((s) => s.id === hoveredLifestyle);
                                return (
                                  <>
                                    <span className="donut-center-tag" style={{ color: target?.color }}>{target?.name}</span>
                                    <strong className="donut-center-amt">{formatMoney(target?.amountCents ?? 0)}</strong>
                                    <span className="donut-center-sub">{target?.percentage.toFixed(1)}% share</span>
                                  </>
                                );
                              })()
                            ) : (
                              <>
                                <span className="donut-center-tag">Lifestyle Lens</span>
                                <strong className="donut-center-amt">{formatMoney(analytics?.totals.socialExpenses ?? 0)}</strong>
                                <span className="donut-center-sub">Social spend ({analytics?.totals.socialPercentage ?? 0}%)</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Lifestyle Cards */}
                        <div className="lifestyle-cards-stack">
                          {lifestyleData.map((item) => {
                            const isHovered = hoveredLifestyle === item.id;
                            const percentage = analytics?.totals.totalExpenses
                              ? ((item.amountCents / analytics.totals.totalExpenses) * 100).toFixed(1)
                              : "0";
                            return (
                              <div
                                key={item.id}
                                className={`lifestyle-info-card${isHovered ? " is-hovered" : ""}`}
                                onMouseEnter={() => setHoveredLifestyle(item.id)}
                                onMouseLeave={() => setHoveredLifestyle(null)}
                              >
                                <div className="card-top-row">
                                  <div className="card-title-group">
                                    <span className="card-badge" style={{ backgroundColor: `${item.color}1a`, color: item.color }}>
                                      <Icon name={item.icon} className="icon-sm" />
                                    </span>
                                    <div>
                                      <h3 className="card-heading">{item.name}</h3>
                                      <p className="card-desc">{item.description}</p>
                                    </div>
                                  </div>
                                  <div className="card-amount-group">
                                    <strong className="card-amount">{formatMoney(item.amountCents)}</strong>
                                    <span className="card-pill" style={{ backgroundColor: `${item.color}1a`, color: item.color }}>
                                      {percentage}%
                                    </span>
                                  </div>
                                </div>
                                <div className="lifestyle-track">
                                  <div className="lifestyle-fill" style={{ width: `${percentage}%`, backgroundColor: item.color }} />
                                </div>
                              </div>
                            );
                          })}

                        </div>
                      </div>
                    )
                  ) : null}

                  {/* TAB 3: MONTHLY BREAKDOWN TABLE */}
                  {distributionTab === "monthly" ? (
                    <div className="monthly-table-wrapper">
                      <table className="monthly-data-table" aria-label="12-month expense and income summary table">
                        <thead>
                          <tr>
                            <th>Month</th>
                            <th className="text-right">Spend</th>
                            <th className="text-right">Income</th>
                            <th className="text-right">Net Flow</th>
                            <th className="text-right">Social</th>
                            <th className="text-right">MoM Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics?.months.map((month, idx, arr) => {
                            const prevMonth = idx > 0 ? arr[idx - 1] : null;
                            const mom =
                              prevMonth && prevMonth.expenses > 0
                                ? Math.round(((month.expenses - prevMonth.expenses) / prevMonth.expenses) * 100)
                                : null;
                            const net = month.income - month.expenses;
                            const isSelected = selectedMonthKey === month.key;

                            return (
                              <tr
                                key={month.key}
                                className={`${isSelected ? "table-row-selected" : ""}${month.expenses === 0 && month.income === 0 ? " table-row-empty" : ""}`}
                                onClick={() => setSelectedMonthKey(selectedMonthKey === month.key ? null : month.key)}
                              >
                                <td>
                                  <div className="month-td-cell">
                                    <strong>{month.label}</strong>
                                    <span className="muted">{month.key}</span>
                                  </div>
                                </td>
                                <td className="text-right">
                                  <span className="table-amt-spend">{formatMoney(month.expenses)}</span>
                                </td>
                                <td className="text-right">
                                  <span className="table-amt-income">{formatMoney(month.income)}</span>
                                </td>
                                <td className="text-right">
                                  <span className={`table-amt-net ${net >= 0 ? "positive" : "negative"}`}>
                                    {formatMoney(net)}
                                  </span>
                                </td>
                                <td className="text-right">
                                  <span className="table-amt-social">{formatMoney(month.social)}</span>
                                </td>
                                <td className="text-right">
                                  {mom === null ? (
                                    <span className="table-mom muted">—</span>
                                  ) : (
                                    <span className={`table-mom ${mom > 0 ? "negative" : "positive"}`}>
                                      {mom > 0 ? `+${mom}%` : `${mom}%`}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              </section>

              {/* 3. Recent Transactions */}
              <section className="surface" aria-labelledby="recent-title">
                <div className="surface-header">
                  <div>
                    <h2 id="recent-title">Recent transactions</h2>
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
                              <span className="category-pill">{transaction.category?.name ?? "Misc"}</span>
                              <span className="ledger-subline-date muted">· {shortDate(transaction.date)}</span>
                              {transaction.isSocial ? <span className="social-pill"><Icon name="users" className="icon-sm" /> Social</span> : null}
                              {transaction.isDating ? <span className="dating-pill"><Icon name="heart" className="icon-sm" /> Dating</span> : null}
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
                  <div className="empty-state">
                    <div>
                      <strong>No transactions yet.</strong>
                      <p>Use Add to create the first one.</p>
                    </div>
                  </div>
                )}
              </section>
            </div>

            {/* Right Secondary Stack */}
            <div className="workspace-stack">
              {/* Social Lens Card */}
              <section className="surface" aria-labelledby="social-title">
                <div className="surface-header">
                  <div>
                    <h2 id="social-title">The social line</h2>
                  </div>
                  <Icon name="users" className="icon-lg" />
                </div>
                <div className="surface-body">
                  <strong className="metric-value">{formatMoney(analytics?.totals.socialExpenses ?? 0)}</strong>
                  <p className="muted">{analytics?.totals.socialPercentage ?? 0}% of tracked spend across the last 12 months</p>
                  <div className="insight-list">
                    {analytics?.socialByCategory.filter((item) => item.amountCents > 0).slice(0, 3).map((item) => (
                      <div className="insight-row" key={item.name}>
                        <span className="insight-label">
                          <strong>{item.name}</strong>
                          <span>social category</span>
                        </span>
                        <span className="insight-value">{formatMoney(item.amountCents)}</span>
                      </div>
                    ))}
                  </div>
                  {analytics?.socialTopMerchants.length ? (
                    <div className="insight-list" style={{ marginTop: 12 }}>
                      {analytics.socialTopMerchants.slice(0, 3).map((item) => (
                        <div className="insight-row" key={`social-${item.merchant}`}>
                          <span className="insight-label">
                            <strong>{item.merchant}</strong>
                            <span>{item.count} social transaction{item.count === 1 ? "" : "s"}</span>
                          </span>
                          <span className="insight-value">{formatMoney(item.amountCents)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="insight-list" style={{ marginTop: 12 }}>
                    {(analytics?.months ?? []).slice(-3).map((month) => (
                      <div className="insight-row" key={`social-month-${month.key}`}>
                        <span className="insight-label">
                          <strong>{month.label}</strong>
                          <span>social by month</span>
                        </span>
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

              {/* Top Merchants Card */}
              <section className="surface" aria-labelledby="merchant-title">
                <div className="surface-header">
                  <div>
                    <h2 id="merchant-title">Top merchants</h2>
                  </div>
                  <Icon name="arrow-up-right" className="icon-lg" />
                </div>
                <div className="surface-body">
                  {analytics?.topMerchants.length ? (
                    <div className="insight-list">
                      {analytics.topMerchants.slice(0, 5).map((item) => (
                        <div className="insight-row" key={`merchant-${item.merchant}`}>
                          <span className="insight-label">
                            <strong>{item.merchant}</strong>
                            <span>{item.count} transaction{item.count === 1 ? "" : "s"}</span>
                          </span>
                          <span className="insight-value">{formatMoney(item.amountCents)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div>
                        <strong>Merchant routes are empty.</strong>
                        <p>Top merchants appear once you have a few expense rows.</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Likely Recurring Subscriptions Card */}
              <section className="surface" aria-labelledby="recurring-title">
                <div className="surface-header">
                  <div>
                    <h2 id="recurring-title">Likely recurring</h2>
                  </div>
                  <Icon name="refresh" className="icon-lg" />
                </div>
                <div className="surface-body">
                  {analytics?.recurring.length ? (
                    <div className="insight-list">
                      {analytics.recurring.slice(0, 4).map((item) => (
                        <div className="insight-row" key={`${item.merchant}-${item.category}`}>
                          <span className="insight-label">
                            <strong>{item.merchant}</strong>
                            <span>{item.category} · every ~{item.cadenceDays} days</span>
                          </span>
                          <span className="insight-value">{formatMoney(item.amountCents)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div>
                        <strong>No repeating routes yet.</strong>
                        <p>Recurring suggestions appear after a merchant shows a regular pattern.</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
