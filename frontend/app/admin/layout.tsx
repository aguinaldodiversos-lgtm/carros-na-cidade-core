import type { Metadata } from "next";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { requireAdminSession } from "@/lib/admin/server-admin-session";

export const metadata: Metadata = {
  title: "Painel administrativo",
  description: "Painel administrativo — Carros na Cidade.",
  robots: { index: false, follow: false },
};

// Garante avaliação server-side a cada request — sem cache estático do shell.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSession();

  return (
    <div className="min-h-screen bg-cnc-bg">
      <AdminTopbar />
      <main className="mx-auto max-w-[1440px] px-5 py-6">{children}</main>
    </div>
  );
}
