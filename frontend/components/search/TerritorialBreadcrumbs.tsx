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

export function TerritorialBreadcrumbs({
  data,
  mode,
}: TerritorialBreadcrumbsProps) {
  const items = buildTerritorialBreadcrumbs(data, mode);

  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.href}-${item.label}`} className="flex items-center gap-2">
              {isLast ? (
                <span className="font-medium text-zinc-800">{item.label}</span>
              ) : (
                <Link
                  href={item.href}
                  className="transition hover:text-zinc-900"
                >
                  {item.label}
                </Link>
              )}

              {!isLast && <span className="text-zinc-300">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
