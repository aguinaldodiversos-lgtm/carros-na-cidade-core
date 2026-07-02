"use client";

/**
 * Menu de usuário do topo (Fase B) — avatar + nome + tipo, com dropdown.
 * Compartilhado pelos dois painéis. Reusa AccountLogoutButton (mesma lógica
 * de logout já existente). Fecha ao clicar fora ou apertar Escape.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AccountLogoutButton } from "@/components/account/AccountLogoutButton";

type AccountUserMenuProps = {
  userName: string;
  accountLabel: string;
};

export default function AccountUserMenu({ userName, accountLabel }: AccountUserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = userName.trim().slice(0, 1).toUpperCase() || "U";

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="account-user-menu-trigger"
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-[#f1f5fb]"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1d2538] text-sm font-extrabold text-white">
          {initial}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-sm font-bold leading-tight text-[#1d2538]">
            {userName}
          </span>
          <span className="block truncate text-xs leading-tight text-[#6b7280]">{accountLabel}</span>
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 text-[#94a3b8] transition ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-[#e8ecf4] bg-white p-2 shadow-[0_16px_44px_rgba(11,22,44,0.18)]"
          data-testid="account-user-menu"
        >
          <div className="border-b border-[#eef1f6] px-3 py-2">
            <p className="truncate text-sm font-bold text-[#1d2538]">{userName}</p>
            <p className="truncate text-xs text-[#6b7280]">{accountLabel}</p>
          </div>
          <Link
            href="/"
            role="menuitem"
            className="mt-1 block rounded-lg px-3 py-2 text-sm font-semibold text-[#37425d] hover:bg-[#f8fafc]"
            onClick={() => setOpen(false)}
          >
            ← Voltar ao site
          </Link>
          <AccountLogoutButton className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#b45309] hover:bg-[#fff7ed] disabled:opacity-60" />
        </div>
      ) : null}
    </div>
  );
}
