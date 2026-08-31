import type { ReactNode } from "react";
import AuthGate from "@/components/auth-gate";
import AppShell from "@/components/app-shell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
