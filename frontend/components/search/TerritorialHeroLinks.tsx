// frontend/components/search/TerritorialHeroLinks.tsx

"use client";

import Link from "next/link";
import type { TerritorialPagePayload } from "../../lib/search/territorial-public";
import { buildTerritorialHeroLinks } from "../../lib/search/territorial-navigation";

interface TerritorialHeroLinksProps {
  data: TerritorialPagePayload;
}

export function TerritorialHeroLinks({ data }: TerritorialHeroLinksProps) {
  const items = buildTerritorialHeroLinks(data);

  if (!items.length) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={`${item.href}-${item.label}`}
          href={item.href}
          className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
