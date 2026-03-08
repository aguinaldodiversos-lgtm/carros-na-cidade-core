// frontend/components/layout/TerritorialHeaderLinks.tsx

"use client";

import Link from "next/link";

export interface TerritorialHeaderLinkItem {
  label: string;
  href: string;
}

interface TerritorialHeaderLinksProps {
  items?: TerritorialHeaderLinkItem[];
}

const DEFAULT_ITEMS: TerritorialHeaderLinkItem[] = [
  { label: "Comprar carros", href: "/anuncios" },
  { label: "Explorar cidades", href: "/cidade/atibaia" },
  { label: "Oportunidades", href: "/cidade/atibaia/oportunidades" },
  { label: "Abaixo da FIPE", href: "/cidade/atibaia/abaixo-da-fipe" },
];

export function TerritorialHeaderLinks({
  items = DEFAULT_ITEMS,
}: TerritorialHeaderLinksProps) {
  if (!items.length) return null;

  return (
    <nav className="hidden items-center gap-5 xl:flex">
      {items.map((item) => (
        <Link
          key={`${item.href}-${item.label}`}
          href={item.href}
          className="text-sm font-medium text-zinc-600 transition hover:text-zinc-900"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
