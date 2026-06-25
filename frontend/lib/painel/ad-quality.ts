/**
 * Qualidade do anúncio (Revisão / step 5 do wizard).
 *
 * Função PURA e testável: recebe sinais booleanos/contagem derivados do
 * estado do wizard e devolve pontuação 0–100 + classificação + checklist.
 * Mantida fora do componente para ter teste unitário previsível (spec §6/§22).
 *
 * Pesos (spec §6):
 *   foto 25 · preço 20 · descrição 20 · cidade 20 · opcionais 15  → 100
 *
 * Faixas:
 *   80–100 Muito boa · 60–79 Boa · 40–59 Regular · <40 Incompleta
 */

export type AdQualityRating = "Muito boa" | "Boa" | "Regular" | "Incompleta";

export type AdQualityCheck = {
  key: "photos" | "price" | "description" | "city" | "optionals";
  label: string;
  ok: boolean;
  points: number;
};

export type AdQuality = {
  score: number;
  rating: AdQualityRating;
  checks: AdQualityCheck[];
};

export type AdQualitySignals = {
  photos: number;
  hasPrice: boolean;
  hasDescription: boolean;
  hasCity: boolean;
  hasOptionals: boolean;
};

const WEIGHTS = {
  photos: 25,
  price: 20,
  description: 20,
  city: 20,
  optionals: 15,
} as const;

export function ratingForScore(score: number): AdQualityRating {
  if (score >= 80) return "Muito boa";
  if (score >= 60) return "Boa";
  if (score >= 40) return "Regular";
  return "Incompleta";
}

export function computeAdQuality(signals: AdQualitySignals): AdQuality {
  const checks: AdQualityCheck[] = [
    {
      key: "photos",
      label: "Fotos adicionadas",
      ok: signals.photos > 0,
      points: WEIGHTS.photos,
    },
    {
      key: "price",
      label: "Preço informado",
      ok: signals.hasPrice,
      points: WEIGHTS.price,
    },
    {
      key: "description",
      label: "Descrição preenchida",
      ok: signals.hasDescription,
      points: WEIGHTS.description,
    },
    {
      key: "city",
      label: "Cidade definida",
      ok: signals.hasCity,
      points: WEIGHTS.city,
    },
    {
      key: "optionals",
      label: "Opcionais selecionados",
      ok: signals.hasOptionals,
      points: WEIGHTS.optionals,
    },
  ];

  const score = checks.reduce((sum, c) => sum + (c.ok ? c.points : 0), 0);

  return { score, rating: ratingForScore(score), checks };
}
