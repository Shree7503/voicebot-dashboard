import { ReactNode, Suspense } from "react";
import { DashboardShell } from "./dashboard-shell";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center min-h-screen">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground-dim border-t-accent" />
        </div>
      }
    >
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}
