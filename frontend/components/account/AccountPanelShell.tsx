"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AccountLogoutButton } from "@/components/account/AccountLogoutButton";
import AccountPlanCard from "@/components/account/AccountPlanCard";
import AccountUserMenu from "@/components/account/AccountUserMenu";
import { SITE_LOGO_SRC } from "@/lib/site/brand-assets";

export type AccountPanelVariant = "pf" | "lojista";

type NavItem = {
  label: string;
  href: string;
  icon: "home" | "ads" | "user" | "key" | "msg" | "billing" | "users";
};

function NavIcon({ name }: { name: NavItem["icon"] }) {
  const cls = "h-[18px] w-[18px] shrink-0";
  switch (name) {
    case "home":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case "ads":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M4 6h16v12H4V6Zm3 3h10M7 15h6" />
        </svg>
      );
    case "user":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 9a8 8 0 0 1 16 0" />
        </svg>
      );
    case "key":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M15.5 7.5a4 4 0 1 0 2.2 2.2L21 12l-2 2-2.5-2.5M10.5 13.5 7 17" />
        </svg>
      );
    case "msg":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M4 6h16v10H8l-4 4V6Z" />
        </svg>
      );
    case "billing":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M4 7h16v10H4V7Zm2 4h12M8 15h4" />
        </svg>
      );
    case "users":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3ZM8 13a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 6a5 5 0 0 0-10 0M3 19a6 6 0 0 1 11.3-2.2" />
        </svg>
      );
    default:
      return null;
  }
}

function buildNav(basePath: string, variant: AccountPanelVariant): NavItem[] {
  if (variant === "pf") {
    return [
      { label: "Painel", href: basePath, icon: "home" },
      { label: "Meus anúncios", href: `${basePath}/meus-anuncios`, icon: "ads" },
      { label: "Dados pessoais", href: `${basePath}/conta`, icon: "user" },
      { label: "Trocar senha", href: `${basePath}/senha`, icon: "key" },
    ];
  }
  return [
    { label: "Painel", href: basePath, icon: "home" },
    { label: "Meus anúncios", href: `${basePath}/meus-anuncios`, icon: "ads" },
    { label: "Mensagens", href: `${basePath}/mensagens`, icon: "msg" },
    { label: "Plano e cobranças", href: `${basePath}/plano`, icon: "billing" },
  ];
}

/**
 * Sino de notificações — ESTÁTICO e SEM badge de contagem.
 *
 * Não existe sistema de notificações de usuário no backend hoje (a área de
 * Mensagens é stub). Renderizamos o ícone para compor o topo como no mockup,
 * mas sem número falso: nada de "2" hardcoded que não significa nada. Quando
 * houver fonte real, este vira interativo com contagem verdadeira.
 */
function NotificationBell() {
  return (
    <span
      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#94a3b8]"
      title="Notificações — em breve"
      aria-label="Notificações (nenhuma novidade por enquanto)"
      data-testid="account-notifications-bell"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z" />
        <path d="M10.5 21a1.5 1.5 0 0 0 3 0" />
      </svg>
    </span>
  );
}

/** Card de suporte da sidebar. "Abrir atendimento" → /contato (canal oficial). */
function SupportCard() {
  return (
    <div className="rounded-2xl border border-[#dbe7fb] bg-[#eff5ff] p-4 text-center">
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#0e62d8]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 13a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-1v-6h3M4 13v4a2 2 0 0 0 2 2h1v-6H4" />
        </svg>
      </div>
      <p className="mt-2 text-sm font-bold text-[#1d2538]">Precisa de ajuda?</p>
      <p className="mt-0.5 text-xs text-[#5a647d]">Fale com nosso time sempre que precisar.</p>
      <Link
        href="/contato"
        className="mt-3 block rounded-lg border border-[#cfe0fc] bg-white px-3 py-2 text-sm font-bold text-[#0e62d8] transition hover:bg-[#f0f6ff]"
      >
        Abrir atendimento
      </Link>
    </div>
  );
}

type AccountPanelShellProps = {
  basePath: "/dashboard" | "/dashboard-loja";
  variant: AccountPanelVariant;
  userName: string;
  accountLabel: string;
  children: React.ReactNode;
};

export default function AccountPanelShell({
  basePath,
  variant,
  userName,
  accountLabel,
  children,
}: AccountPanelShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = buildNav(basePath, variant);

  const isActive = (href: string) => {
    if (href === basePath) return pathname === basePath;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f3f4f6]">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-0 lg:flex-row lg:gap-8">
        {/* Mobile top bar */}
        <div className="flex w-full flex-col border-b border-[#e5e7eb] bg-white lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4ef] px-3 py-2 text-sm font-semibold text-[#1d2538]"
              onClick={() => setMobileOpen((o) => !o)}
              aria-expanded={mobileOpen}
            >
              Menu
            </button>
            <div className="flex items-center gap-2">
              <AccountUserMenu userName={userName} accountLabel={accountLabel} />
              <Link
                href="/anunciar/novo"
                className="inline-flex h-10 items-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-4 text-sm font-bold text-white"
              >
                + Novo anúncio
              </Link>
            </div>
          </div>
          {mobileOpen && (
            <nav className="border-t border-[#eef1f6] px-2 pb-3 pt-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${
                    isActive(item.href)
                      ? "bg-[#eef4ff] text-[#0e62d8]"
                      : "text-[#37425d] hover:bg-[#f8fafc]"
                  }`}
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
          {/* Sidebar desktop */}
          <aside className="sticky top-0 hidden h-[calc(100vh-4rem)] w-[260px] shrink-0 flex-col overflow-y-auto border-r border-[#e8ecf4] bg-white px-4 py-8 lg:flex">
            <Link href="/" className="mb-8 inline-flex shrink-0 items-center px-1" aria-label="Carros na Cidade">
              <Image
                src={SITE_LOGO_SRC}
                alt="Carros na Cidade"
                width={400}
                height={100}
                priority
                className="h-11 w-auto max-w-[200px] object-contain object-left"
                style={{ mixBlendMode: "multiply" }}
              />
            </Link>

            <nav className="flex flex-col gap-1">
              {nav.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      active
                        ? "border-l-[3px] border-[#0e62d8] bg-[#eef4ff] text-[#0e62d8]"
                        : "border-l-[3px] border-transparent text-[#37425d] hover:bg-[#f8fafc]"
                    }`}
                  >
                    <NavIcon name={item.icon} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* MEU PLANO + suporte (Fase B) — dado real via card client. */}
            <div className="mt-6 space-y-4">
              <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-[#94a3b8]">
                Meu plano
              </p>
              <AccountPlanCard variant={variant} basePath={basePath} />
              <SupportCard />
            </div>

            <div className="mt-auto pt-6">
              <Link
                href="/anunciar/novo"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.25)] transition hover:brightness-110"
              >
                <span className="text-lg leading-none">+</span>
                Novo anúncio
              </Link>
              <Link
                href="/"
                className="mt-6 block px-1 text-xs font-bold text-[#6b7280] hover:text-[#0e62d8]"
              >
                ← Voltar ao site
              </Link>
              <AccountLogoutButton
                label="Sair da conta"
                className="mt-3 block w-full px-1 text-left text-xs font-bold text-[#6b7280] hover:text-[#0e62d8] disabled:opacity-60"
              />
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Top bar desktop (Fase B): sino estático + menu de usuário. */}
            <div className="hidden items-center justify-end gap-3 px-6 pt-6 lg:flex">
              <NotificationBell />
              <AccountUserMenu userName={userName} accountLabel={accountLabel} />
            </div>
            <div className="px-4 py-6 sm:px-6 lg:pb-10 lg:pt-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
