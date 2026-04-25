// frontend/components/ui/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Bottom navigation mobile.
 *
 * Regra de aparição definida em DIAGNOSTICO_REDESIGN.md §11:
 *   APARECE: home, /anuncios, /cidade/**, /blog, /tabela-fipe,
 *           /simulador-financiamento, /favoritos, /dashboard*
 *   NÃO APARECE: /login, /cadastro, /recuperar-senha, /admin/*
 *   SUBSTITUÍDO POR <StickyCTA>: /veiculo/[slug] (PR I)
 *
 * Este primitivo apenas renderiza. A decisão de aparecer/não fica
 * com a página/layout que o consome.
 *
 * Variant `with-fab`: destaca o item central (Anunciar) como FAB
 * arredondado e elevado.
 *
 * IMPORTANTE — RESPONSABILIDADE DO CONSUMIDOR
 *
 * 1. SAFE AREA: este componente já aplica `pb-[env(safe-area-inset-bottom)]`
 *    para iPhones com home indicator. Não há nada extra a fazer.
 *
 * 2. PADDING DE CONTEÚDO: como BottomNav é `position: fixed`, ele
 *    cobre conteúdo se a página não reservar espaço inferior. A página
 *    que monta o BottomNav DEVE adicionar `pb-20` (80px) ou maior no
 *    container principal em mobile, p.ex.:
 *
 *      <main className="pb-20 md:pb-0">{children}</main>
 *
 *    A altura nominal é 64px + safe-area. Use `pb-20` (80px) com
 *    folga e desativar em desktop com `md:pb-0`.
 *
 * 3. Z-INDEX: usa `z-40`. Modais/drawers do app devem usar `z-50+`
 *    para ficar acima do BottomNav.
 */

type BottomNavVariant = "default" | "with-fab";

export type BottomNavItem = {
  /** Identificador único do item, usado também para casar pathname. */
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
  /** Quando true, destaca como FAB (apenas com variant="with-fab"). */
  primary?: boolean;
  /** Padrão regex para considerar ativo (default: pathname.startsWith(href)). */
  activePattern?: RegExp;
  /** Pequeno badge numérico (ex: notificações). */
  badge?: number;
};

export type BottomNavProps = {
  items: ReadonlyArray<BottomNavItem>;
  variant?: BottomNavVariant;
  className?: string;
  /** Aria-label do <nav>. */
  ariaLabel?: string;
};

function isItemActive(pathname: string, item: BottomNavItem): boolean {
  if (item.activePattern) return item.activePattern.test(pathname);
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function ItemBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const display = count > 9 ? "9+" : String(count);
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cnc-danger px-1 text-[10px] font-bold text-white">
      {display}
    </span>
  );
}

export function BottomNav({
  items,
  variant = "default",
  className = "",
  ariaLabel = "Navegação principal",
}: BottomNavProps) {
  const pathname = usePathname() || "/";

  return (
    <nav
      aria-label={ariaLabel}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-cnc-line bg-cnc-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden ${className}`}
    >
      <ul className="mx-auto flex h-16 max-w-2xl items-stretch justify-around gap-1 px-2">
        {items.map((item) => {
          const active = isItemActive(pathname, item);
          const isFab = variant === "with-fab" && item.primary;

          if (isFab) {
            return (
              <li key={item.id} className="flex items-center justify-center">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-premium ring-4 ring-cnc-surface transition hover:bg-primary-strong"
                >
                  <span className="relative">{item.icon}</span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.id} className="flex flex-1 items-center justify-center">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                  active ? "text-primary" : "text-cnc-muted hover:text-cnc-text"
                }`}
              >
                <span className="relative">
                  {item.icon}
                  {item.badge ? <ItemBadge count={item.badge} /> : null}
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
