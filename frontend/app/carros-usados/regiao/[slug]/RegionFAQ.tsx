/**
 * FAQ regional — answers às 4 perguntas estratégicas listadas no spec do
 * PR 2 da arquitetura territorial:
 *
 *   1. Vale a pena buscar carros na região?
 *   2. Quais cidades fazem parte da Região de [Cidade]?
 *   3. Posso ver somente anúncios de [Cidade]?
 *   4. Como anunciar para compradores da região?
 *
 * Server component puro: usa `<details>` nativo para colapso, sem JS no
 * client. Acessível por padrão (semantic HTML), SEO-friendly e leve.
 *
 * Quando a flag `REGIONAL_PAGE_INDEXABLE=true`, o page.tsx emite também
 * um JSON-LD FAQPage com estas mesmas perguntas/respostas (rich snippet
 * elegível no Google). Sem indexação, o JSON-LD não vai junto — não faz
 * sentido alimentar SE com página noindex.
 */

import type { RegionMember } from "@/lib/regions/fetch-region";

import { buildRegionFaqEntries } from "./region-faq-entries";

interface RegionFAQProps {
  cityName: string;
  citySlug: string;
  stateUF: string;
  members: RegionMember[];
  radiusKm: number;
}

export function RegionFAQ({
  cityName,
  citySlug,
  stateUF,
  members,
  radiusKm,
}: RegionFAQProps) {
  const entries = buildRegionFaqEntries({
    cityName,
    citySlug,
    stateUF,
    members,
    radiusKm,
  });

  return (
    <section
      aria-labelledby="regional-faq-heading"
      className="mt-10 rounded-xl border border-cnc-line bg-white p-4 sm:p-6"
      data-testid="regional-faq"
    >
      <h2
        id="regional-faq-heading"
        className="text-base font-semibold text-cnc-text-strong sm:text-lg"
      >
        Perguntas frequentes sobre a Região de {cityName}
      </h2>

      <div className="mt-4 divide-y divide-cnc-line">
        {entries.map((entry) => (
          <details
            key={entry.id}
            className="group py-3 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-cnc-text-strong sm:text-[15px]">
              <span>{entry.question}</span>
              <span
                aria-hidden="true"
                className="ml-2 text-cnc-muted transition group-open:rotate-180"
              >
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 7 5 5 5-5" />
                </svg>
              </span>
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-cnc-muted">
              {entry.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
