// frontend/components/search/TerritorialInternalLinksSection.tsx

"use client";

import Link from "next/link";
import type { TerritorialPagePayload } from "../../lib/search/territorial-public";
import { buildTerritorialInternalLinkGroups } from "../../lib/search/territorial-navigation";

interface TerritorialInternalLinksSectionProps {
  data: TerritorialPagePayload;
}

export function TerritorialInternalLinksSection({
  data,
}: TerritorialInternalLinksSectionProps) {
  const groups = buildTerritorialInternalLinkGroups(data);

  if (!groups.length) return null;

  return (
    <section className="space-y-5 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          Navegação local inteligente
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Explore rotas relacionadas da cidade, marcas e modelos com mais demanda.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {groups.map((group) => (
          <div
            key={group.title}
            className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4"
          >
            <h3 className="text-sm font-semibold text-zinc-900">{group.title}</h3>

            <div className="mt-3 flex flex-col gap-2">
              {group.items.map((item) => (
                <Link
                  key={`${group.title}-${item.href}-${item.label}`}
                  href={item.href}
                  className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100"
                >
                  <span className="truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="ml-3 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
