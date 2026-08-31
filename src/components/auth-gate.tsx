"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export default function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"checking" | "authorized">("checking");

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { authenticated?: boolean };
        if (!data.authenticated) {
          const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
          router.replace(`/login${next}`);
          return;
        }
        if (active) {
          setStatus("authorized");
        }
      })
      .catch(() => router.replace("/login"));

    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (status !== "authorized") {
    return <main className="login-page"><div className="surface login-panel"><div className="loading-block" /></div></main>;
  }

  return children;
}
