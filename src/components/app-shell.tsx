"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: "chart" as const },
  { href: "/transactions", label: "Ledger", icon: "book" as const },
  { href: "/mobile", label: "Add", icon: "plus" as const },
  { href: "/settings", label: "Settings", icon: "settings" as const },
];

export default function AppShell({
  children,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="app-shell">
      {/* Mobile Sticky Header */}
      <header className="mobile-app-header">
        <div className="mobile-header-bar">
          <Link href="/dashboard" className="brand" aria-label="Finance Tracker overview">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">
              Finance Tracker
              <small>private ledger</small>
            </span>
          </Link>

          <div className="mobile-header-controls">
            <button
              className="button button-quiet button-sm mobile-menu-toggle"
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
            >
              <Icon name={mobileMenuOpen ? "x" : "menu"} className="icon" />
            </button>
          </div>
        </div>

        {/* Mobile Quick Nav Strip */}
        <nav className="mobile-nav-strip" aria-label="Mobile quick navigation">
          <div className="mobile-nav-scroll">
            {navItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  className={`mobile-nav-tab${active ? " mobile-nav-tab-active" : ""}`}
                  href={item.href}
                >
                  <Icon name={item.icon} className="icon-sm" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Mobile Drawer Overlay / Menu */}
        {mobileMenuOpen ? (
          <div className="mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)}>
            <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="mobile-drawer-head">
                <span className="nav-label">Workspace Navigation</span>
                <button
                  className="button button-quiet button-sm mobile-drawer-close"
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close menu"
                >
                  <Icon name="x" className="icon-sm" />
                </button>
              </div>

              <nav className="mobile-drawer-nav" aria-label="Mobile full navigation">
                <ul className="nav-list">
                  {navItems.map((item) => {
                    const active =
                      pathname === item.href ||
                      (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
                    return (
                      <li key={item.href}>
                        <Link
                          className={`nav-link${active ? " nav-link-active" : ""}`}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <Icon name={item.icon} className="icon-sm" />
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div className="mobile-drawer-foot">
                <div className="private-stamp">
                  <Icon name="lock" className="icon-sm" />
                  <span>
                    <strong>Private &amp; Secure</strong>
                    Self-hosted private financial ledger.
                  </span>
                </div>
                <button
                  className="nav-link mobile-logout-btn"
                  type="button"
                  onClick={logout}
                  disabled={loggingOut}
                >
                  <Icon name="logout" className="icon-sm" />
                  <span>{loggingOut ? "Signing out…" : "Sign out"}</span>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      {/* Desktop Sidebar */}
      <aside className="sidebar desktop-sidebar">
        <Link href="/dashboard" className="brand" aria-label="Finance Tracker overview">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">
            Finance Tracker
            <small>private ledger</small>
          </span>
        </Link>

        <p className="nav-label">Workspace</p>
        <nav aria-label="Main navigation">
          <ul className="nav-list">
            {navItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link className={`nav-link${active ? " nav-link-active" : ""}`} href={item.href}>
                    <Icon name={item.icon} className="icon-sm" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="sidebar-foot">
          <div className="private-stamp">
            <Icon name="lock" className="icon-sm" />
            <span>
              <strong>Private &amp; Secure</strong>
              Your private financial ledger.
            </span>
          </div>
          <button className="nav-link" type="button" onClick={logout} disabled={loggingOut}>
            <Icon name="logout" className="icon-sm" />
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title-group">
            <h1>{title}</h1>
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="topbar-actions">{actions}</div> : null}
        </header>
        {children}
      </main>
    </div>
  );
}
