// frontend/components/shell/SiteBottomNav.tsx
"use client";

import { BottomNav, type BottomNavItem } from "@/components/ui/BottomNav";

/**
 * Bottom navigation mobile compartilhada de TODAS as páginas públicas
 * (home, catálogo, cidade, blog, FIPE, simulador, favoritos, painel) —
 * DIAGNOSTICO_REDESIGN.md §11.
 *
 * 5 itens canônicos com o "+" (Anunciar) destacado como FAB central.
 * Em mobile fica fixa no rodapé; em desktop some (regra do <BottomNav>:
 * md:hidden).
 *
 * O BottomNav do DS calcula o item ativo via `usePathname()`. Aqui
 * apenas declaramos os 5 itens com seus `activePattern` apropriados —
 * cada página renderiza o mesmo SiteBottomNav e o estado ativo é
 * automático.
 *
 *   - Início (home): activePattern = ^/$ (somente "/" exato)
 *   - Buscar:        href "/comprar" — ativo em /comprar e
 *                    /comprar/cidade/[slug] e /comprar/estado/[uf]
 *   - Anunciar:      FAB; ativo em /anunciar/*
 *   - Favoritos:     ativo em /favoritos
 *   - Conta:         ativo em /dashboard/* e /dashboard-loja/*
 *
 * Originalmente nasceu como `HomeBottomNav` no PR G; renomeado para
 * `SiteBottomNav` no PR H quando passou a ser reusado em
 * /comprar/cidade/[slug].
 */

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 12 12 3l9 9" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
    >
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
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
    activePattern:
      /^\/(comprar|anuncios|carros-em|carros-baratos-em|carros-automaticos-em|cidade)(\/|$)/,
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

export function SiteBottomNav() {
  return <BottomNav items={ITEMS} variant="with-fab" ariaLabel="Navegação principal" />;
}
