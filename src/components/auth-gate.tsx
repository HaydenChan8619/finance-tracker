"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

export default function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"checking" | "authorized">("checking");
  const checkedOnce = useRef(false);

  useEffect(() => {
    // If already authorized, intra-workspace navigation does not need a blocking check
    if (checkedOnce.current && status === "authorized") {
      return;
    }

    let active = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { authenticated?: boolean };
        if (!data.authenticated) {
          // Allow /mobile to render with device auth or offline notice
          if (pathname === "/mobile") {
            if (active) {
              checkedOnce.current = true;
              setStatus("authorized");
            }
            return;
          }
          const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
          router.replace(`/login${next}`);
          return;
        }
        if (active) {
          checkedOnce.current = true;
          setStatus("authorized");
        }
      })
      .catch(() => {
        if (pathname === "/mobile") {
          if (active) {
            checkedOnce.current = true;
            setStatus("authorized");
          }
        } else {
          router.replace("/login");
        }
      });

    return () => {
      active = false;
    };
  }, [pathname, router, status]);

  if (status !== "authorized") {
    return (
      <main className="login-page">
        <div className="surface login-panel" aria-busy="true" aria-label="Verifying access…">
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 24 }}>
            <span className="skeleton skeleton-circle" style={{ width: 34, height: 34 }} />
            <span className="skeleton skeleton-text" style={{ width: 110, height: 16 }} />
          </div>
          <span className="skeleton skeleton-title" style={{ width: 160, height: 26, marginBottom: 20 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <span className="skeleton skeleton-text" style={{ width: 80, height: 12, marginBottom: 6 }} />
              <span className="skeleton skeleton-input" style={{ width: "100%", height: 42 }} />
            </div>
            <div>
              <span className="skeleton skeleton-text" style={{ width: 65, height: 12, marginBottom: 6 }} />
              <span className="skeleton skeleton-input" style={{ width: "100%", height: 42 }} />
            </div>
            <span className="skeleton skeleton-btn" style={{ width: "100%", height: 42, marginTop: 4 }} />
          </div>
        </div>
      </main>
    );
  }

  return children;
}
