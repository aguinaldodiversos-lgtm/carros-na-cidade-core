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
          className="rounded-full border border-[#E5E9F2] bg-[#F8FAFC] px-4 py-2 text-sm font-semibold text-[#33405A] transition hover:border-[#CFD9F0] hover:bg-white"
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
