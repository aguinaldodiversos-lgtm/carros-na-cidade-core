/**
 * Builder puro das entradas do FAQ regional. Separado do componente
 * (`RegionFAQ.tsx`) para que o page.tsx possa montar o JSON-LD FAQPage
 * a partir do MESMO conteúdo — sem divergência entre o que o usuário lê
 * e o que o Googlebot indexa.
 *
 * Função pura, sem `server-only`: testável em isolation.
 */

import type { RegionMember } from "@/lib/regions/fetch-region";

export type RegionFaqEntry = {
  id: string;
  question: string;
  answer: string;
};

type BuildArgs = {
  cityName: string;
  citySlug: string;
  stateUF: string;
  members: RegionMember[];
  radiusKm: number;
};

function buildCitiesParagraph(cityName: string, members: RegionMember[], radiusKm: number): string {
  if (members.length === 0) {
    return `No momento a Região de ${cityName} está limitada à própria cidade-base — conforme novos veículos forem cadastrados nas cidades vizinhas, eles aparecem aqui automaticamente. O alcance regional considera tudo até ${radiusKm} km da cidade-base.`;
  }

  const preview = members.slice(0, 4).map((m) => m.name);
  const remaining = Math.max(0, members.length - preview.length);
  const list =
    remaining > 0 ? `${preview.join(", ")} e mais ${remaining} cidade${remaining === 1 ? "" : "s"}` : preview.join(", ");

  return `A Região de ${cityName} reúne ${cityName} e ${list}, todas dentro de até ${radiusKm} km da cidade-base. Os anúncios destas cidades aparecem ordenados por proximidade — você vê primeiro o que está mais perto de ${cityName}.`;
}

export function buildRegionFaqEntries({
  cityName,
  citySlug,
  stateUF,
  members,
  radiusKm,
}: BuildArgs): RegionFaqEntry[] {
  return [
    {
      id: "vale-a-pena",
      question: `Vale a pena buscar carros na Região de ${cityName}?`,
      answer: `Sim. A região reúne mais oferta que a cidade isolada e mais proximidade que o estado inteiro. Você encontra carros em ${cityName} e nas cidades próximas, num raio de até ${radiusKm} km — todas visitáveis no mesmo dia, sem perder ofertas relevantes só porque estão em uma cidade vizinha.`,
    },
    {
      id: "cidades-incluidas",
      question: `Quais cidades fazem parte da Região de ${cityName}?`,
      answer: buildCitiesParagraph(cityName, members, radiusKm),
    },
    {
      id: "so-cidade",
      question: `Posso ver somente anúncios de ${cityName}?`,
      answer: `Pode. O catálogo da cidade (/comprar/cidade/${citySlug}) mostra apenas ofertas em ${cityName}, sem ampliar para as cidades próximas. Use a página regional quando quiser mais opções perto, e a página da cidade quando preferir restringir a busca à própria ${cityName}.`,
    },
    {
      id: "anunciar",
      question: `Como anunciar para compradores da Região de ${cityName}?`,
      answer: `Ao publicar um anúncio com a cidade ${cityName} (${stateUF}), o veículo aparece automaticamente na Região de ${cityName} para compradores de ${cityName} e das cidades próximas, e também no catálogo estadual de ${stateUF}. Não há custo extra: o alcance regional vem com o portal — anúncios com destaque pago aparecem em posição privilegiada na lista.`,
    },
  ];
}
