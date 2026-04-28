"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { useCity } from "@/lib/city/CityContext";
import { getTerritorialRoutesForCity, isNavLinkActive, SITE_ROUTES } from "@/lib/site/site-navigation";

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={active ? "text-[var(--cnc-primary)]" : "text-[#7a869f]"}
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  );
}

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={active ? "text-[var(--cnc-primary)]" : "text-[#7a869f]"}
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function HeartIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={active ? "text-[var(--cnc-primary)]" : "text-[#7a869f]"}
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
    </svg>
  );
}

function MenuIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={active ? "text-[var(--cnc-primary)]" : "text-[#7a869f]"}
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M4 8h16M4 12h16M4 16h16" />
    </svg>
  );
}

type DockNavItem = {
  id: string;
  label: string;
  href: string;
  icon: (p: { active: boolean }) => ReactNode;
};

/** Barra inferior fixa (mobile) — só nesta página, espelha o mock e rotas territoriais do site. */
export function FinancingSimulatorBottomDock() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();

  const { city } = useCity();
  const routes = getTerritorialRoutesForCity(city.slug);

  const items: DockNavItem[] = [
    { id: "home", label: "Início", href: SITE_ROUTES.home, icon: ({ active }) => <HomeIcon active={active} /> },
    {
      id: "search",
      label: "Buscar",
      href: routes.comprar,
      icon: ({ active }) => <SearchIcon active={active} />,
    },
    {
      id: "favs",
      label: "Favoritos",
      href: SITE_ROUTES.favoritos,
      icon: ({ active }) => <HeartIcon active={active} />,
    },
    {
      id: "publish",
      label: "Anunciar",
      href: "/anunciar",
      icon: () => (
        <span className="flex h-[52px] w-[52px] -translate-y-3 items-center justify-center rounded-full bg-[var(--cnc-primary)] text-white shadow-[0_14px_32px_rgba(14,98,216,0.42)] ring-4 ring-[#f3f6fc] transition hover:bg-[var(--cnc-primary-strong)]">
          <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </span>
      ),
    },
    {
      id: "menu",
      label: "Menu",
      href: routes.blog,
      icon: ({ active }) => <MenuIcon active={active} />,
    },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-[#e8ecf4] bg-white/98 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_40px_rgba(15,23,42,0.08)] backdrop-blur-md lg:hidden rounded-t-[20px]"
      aria-label="Atalhos principais"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {items.map((item, index) => {
          const active = isNavLinkActive(
            pathname,
            new URLSearchParams(searchParams?.toString() ?? ""),
            item.href
          );

          const isMiddle = index === 3 && item.id === "publish";

          const content = (
            <>
              {item.icon({ active })}
              <span
                className={`mt-1 text-[10px] font-bold leading-none ${
                  active && !isMiddle ? "text-[var(--cnc-primary)]" : "text-[#8b96ad]"
                }`}
              >
                {item.label}
              </span>
            </>
          );

          return (
            <li key={item.id} className="flex justify-center">
              <Link
                href={item.href}
                className={`flex w-full flex-col items-center justify-end px-1 py-1 text-center ${
                  isMiddle ? "pt-0" : ""
                }`}
              >
                {content}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
