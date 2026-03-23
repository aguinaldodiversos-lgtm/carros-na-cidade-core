import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AUTH_COOKIE_NAME,
  getSessionDataFromCookieValue,
} from "@/services/sessionService";

export const metadata: Metadata = {
  title: "Minha conta | Carros na Cidade",
  alternates: { canonical: "/conta" },
};

export const dynamic = "force-dynamic";

export default async function ContaPage() {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieValue(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );

  if (!session?.id || !session.accessToken) {
    redirect("/login?next=%2Fconta");
  }

  const dashboardHref =
    session.type === "CNPJ" ? "/dashboard-loja" : "/dashboard";

  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* Profile card */}
        <div className="rounded-2xl border border-[#dfe4ef] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#edf4ff] text-[22px] font-extrabold text-[#0e62d8]">
              {session.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-[20px] font-extrabold text-[#1d2538]">{session.name}</h1>
              <p className="text-[13px] text-[#6b7488]">{session.email}</p>
              <span className="mt-1 inline-block rounded-full bg-[#edf4ff] px-2.5 py-0.5 text-[11px] font-bold text-[#0e62d8]">
                {session.type === "CNPJ" ? "Lojista (CNPJ)" : "Particular (CPF)"}
              </span>
            </div>
          </div>
        </div>

        {/* Quick links */}
        <nav className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            { href: dashboardHref, label: "Dashboard", icon: "📊", desc: "Visão geral dos seus anúncios" },
            { href: "/dashboard/anuncios", label: "Meus anúncios", icon: "📢", desc: "Gerenciar anúncios publicados" },
            { href: "/dashboard/assinatura", label: "Assinatura", icon: "⭐", desc: "Plano atual e upgrades" },
            { href: "/dashboard/pagamentos", label: "Pagamentos", icon: "💳", desc: "Histórico de cobranças" },
            { href: "/recuperar-senha", label: "Alterar senha", icon: "🔑", desc: "Redefina sua senha de acesso" },
            { href: "/ajuda", label: "Ajuda", icon: "❓", desc: "Central de suporte" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-start gap-3 rounded-2xl border border-[#dfe4ef] bg-white p-4 shadow-sm transition hover:border-[#0e62d8]"
            >
              <span className="mt-0.5 text-xl">{item.icon}</span>
              <div>
                <p className="text-[14px] font-bold text-[#1d2538]">{item.label}</p>
                <p className="text-[12px] text-[#6b7488]">{item.desc}</p>
              </div>
            </Link>
          ))}
        </nav>

        {/* Logout */}
        <div className="mt-6 text-center">
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="rounded-xl border border-[#f0a0a0] bg-white px-6 py-2.5 text-[14px] font-semibold text-[#c0392b] transition hover:bg-[#fff0f0]"
            >
              Sair da conta
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
