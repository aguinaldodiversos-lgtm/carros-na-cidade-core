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

  const cityName = data.city?.name?.trim() || "sua cidade";

  return (
    <section className="space-y-5 rounded-[22px] border border-[#E5E9F2] bg-white p-5 shadow-[0_10px_24px_rgba(20,30,60,0.05)]">
      <div>
        <h2 className="text-[17px] font-extrabold text-[#1D2440]">
          Continuar em {cityName}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-[#6E748A]">
          Rotas relacionadas a partir deste território: marcas, modelos e oportunidades alinhadas à
          mesma região.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {groups.map((group) => (
          <div
            key={group.title}
            className="rounded-2xl border border-[#EEF1F6] bg-[#F8FAFC] p-4"
          >
            <h3 className="text-sm font-bold text-[#33405A]">{group.title}</h3>

            <div className="mt-3 flex flex-col gap-2">
              {group.items.map((item) => (
                <Link
                  key={`${group.title}-${item.href}-${item.label}`}
                  href={item.href}
                  className="flex items-center justify-between rounded-xl border border-transparent bg-white px-3 py-2 text-sm font-medium text-[#47506A] shadow-sm transition hover:border-[#D8E2FB] hover:bg-[#F5F8FF]"
                >
                  <span className="truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="ml-3 rounded-full bg-[#EEF4FF] px-2 py-0.5 text-[11px] font-bold text-[#47506A]">
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
