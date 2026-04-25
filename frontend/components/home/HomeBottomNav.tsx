// frontend/components/home/HomeBottomNav.tsx
"use client";

import { BottomNav, type BottomNavItem } from "@/components/ui/BottomNav";

/**
 * PR G — Bottom navigation mobile da Home.
 *
 * Wrapper específico que define os 5 itens canônicos com o "+"
 * (Anunciar) destacado como FAB ao centro. Em mobile a nav fica
 * fixa no rodapé; em desktop ela some (regra do <BottomNav>: md:hidden).
 *
 * Item "Início" usa activePattern para casar exatamente "/" — assim
 * não fica ativo quando o usuário sai para /comprar, /favoritos etc.
 */

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12 12 3l9 9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" strokeLinecap="round" />
    </svg>
  );
}

const ITEMS: ReadonlyArray<BottomNavItem> = [
  {
    id: "home",
    label: "Início",
    href: "/",
    icon: <HomeIcon />,
    activePattern: /^\/$/,
  },
  {
    id: "buscar",
    label: "Buscar",
    href: "/comprar",
    icon: <SearchIcon />,
  },
  {
    id: "anunciar",
    label: "Anunciar",
    href: "/anunciar/novo",
    icon: <PlusIcon />,
    primary: true,
  },
  {
    id: "favoritos",
    label: "Favoritos",
    href: "/favoritos",
    icon: <HeartIcon />,
  },
  {
    id: "conta",
    label: "Conta",
    href: "/dashboard",
    icon: <UserIcon />,
  },
];

export function HomeBottomNav() {
  return <BottomNav items={ITEMS} variant="with-fab" ariaLabel="Navegação principal" />;
}
