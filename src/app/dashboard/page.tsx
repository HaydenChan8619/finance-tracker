import AuthGate from "@/components/auth-gate";
import DashboardClient from "@/app/dashboard/dashboard-client";

export default function DashboardPage() {
  return (
    <AuthGate>
      <DashboardClient />
    </AuthGate>
  );
}
