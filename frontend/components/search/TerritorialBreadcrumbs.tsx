// frontend/components/search/TerritorialBreadcrumbs.tsx

"use client";

import Link from "next/link";
import type { TerritorialPagePayload } from "../../lib/search/territorial-public";
import {
  buildTerritorialBreadcrumbs,
  type TerritorialMode,
} from "../../lib/search/territorial-navigation";

interface TerritorialBreadcrumbsProps {
  data: TerritorialPagePayload;
  mode: TerritorialMode;
}

export function TerritorialBreadcrumbs({ data, mode }: TerritorialBreadcrumbsProps) {
  const items = buildTerritorialBreadcrumbs(data, mode);

  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-5 md:mb-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug text-[#64748b] md:text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.href}-${item.label}`} className="flex items-center gap-2">
              {isLast ? (
                <span className="font-semibold text-[#0f172a]">{item.label}</span>
              ) : (
                <Link href={item.href} className="font-medium transition hover:text-[#0f172a]">
                  {item.label}
                </Link>
              )}

              {!isLast && (
                <span className="text-[#cbd5e1] select-none" aria-hidden>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
