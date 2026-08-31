"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: "chart" as const },
  { href: "/transactions", label: "Transactions", icon: "book" as const },
  { href: "/mobile", label: "Quick capture", icon: "plus" as const },
  { href: "/import", label: "Import", icon: "upload" as const },
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

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
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
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
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

      <main className="main-content">
        <header className="topbar">
          <div>
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
