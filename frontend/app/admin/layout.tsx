"use client";

import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { useAdminGuard } from "@/lib/admin/useAdmin";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAdminGuard();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cnc-bg">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-cnc-muted">Verificando acesso…</span>
        </div>
      </div>
    );
  }

  if (status === "forbidden") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cnc-bg">
        <p className="text-sm text-cnc-muted">Redirecionando…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cnc-bg">
      <AdminTopbar />
      <main className="mx-auto max-w-[1440px] px-5 py-6">{children}</main>
    </div>
  );
}
