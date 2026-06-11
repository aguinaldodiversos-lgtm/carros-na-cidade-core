/**
 * Score de qualidade SEO/IA do anúncio (Fase 4.3).
 *
 * NÃO é promessa de ranking. É um índice de COMPLETUDE/legibilidade do
 * anúncio para busca tradicional, AI Overviews e AI Mode: quanto mais
 * completo e coerente o dado, mais fácil para um buscador/IA entender e
 * usar a página numa resposta (query fan-out). Mede o que está sob nosso
 * controle — campos preenchidos, fotos, contato, frescor — não o algoritmo.
 *
 * Função PURA (sem I/O). Recebe a row de anúncio do admin
 * (admin-ads.repository.findById → a.* + joins) e devolve:
 *   { score: 0..100, band: 'fraco'|'aceitavel'|'pronto',
 *     checklist: [{ key, label, ok, weight }],
 *     missing: [labels...], recommendations: [strings...] }
 */

const MILESECS_PER_DAY = 24 * 60 * 60 * 1000;

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(
    String(v)
      .replace(/[^\d.,-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".")
  );
  return Number.isFinite(n) ? n : null;
}

/** Conta imagens de um anúncio em qualquer um dos formatos conhecidos. */
export function countAdImages(ad) {
  if (!ad) return 0;
  const candidates = [ad.images, ad.image_urls, ad.photos];
  for (const c of candidates) {
    if (Array.isArray(c)) return c.filter(Boolean).length;
    if (typeof c === "string" && c.trim()) {
      try {
        const parsed = JSON.parse(c);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).length;
      } catch {
        // string única não-JSON → conta como 1 se parece URL/caminho
        return c.trim() ? 1 : 0;
      }
    }
  }
  if (str(ad.image_url)) return 1;
  return 0;
}

/**
 * Alt sugerido para a imagem principal do anúncio (espelha
 * frontend/lib/seo/vehicle-image-alt). "[Marca] [Modelo] [Ano] usado em
 * [Cidade] - [UF]". Editável depois no admin.
 */
export function buildAdImageAlt(ad) {
  if (!ad) return "";
  const parts = [str(ad.brand), str(ad.model)].filter(Boolean);
  const year = str(ad.year) || str(ad.year_model);
  if (year) parts.push(year.match(/\d{4}/)?.[0] || year);
  let base = parts.join(" ").trim();
  if (base) base += " usado";
  const city = str(ad.city) || str(ad.city_name);
  const uf = str(ad.state);
  if (city) {
    base += ` em ${city}`;
    if (uf) base += ` - ${uf}`;
  }
  return base.trim();
}

function isActive(ad) {
  return str(ad.status).toLowerCase() === "active";
}

function updatedWithinDays(ad, days) {
  const raw = ad?.updated_at || ad?.updatedAt;
  if (!raw) return false;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return false;
  const now = ad.__now instanceof Date ? ad.__now.getTime() : Date.now();
  return now - t <= days * MILESECS_PER_DAY;
}

/**
 * Critérios ponderados. Soma dos pesos = 100. Cada `test` recebe o ad e a
 * derivação e devolve boolean.
 */
function buildCriteria(ad) {
  const imageCount = countAdImages(ad);
  const price = num(ad.price);
  const fipe = num(ad.fipe_price ?? ad.fipe_value ?? ad.fipe_reference_value);
  const description = str(ad.description);
  const advertiser = str(ad.advertiser_name) || str(ad.seller_name) || str(ad.dealership_name);
  const contact =
    str(ad.whatsapp) ||
    str(ad.whatsapp_number) ||
    str(ad.phone) ||
    str(ad.phone_number) ||
    str(ad.seller_phone);

  return [
    { key: "title", label: "Título claro", weight: 8, ok: str(ad.title).length >= 8 },
    {
      key: "brand_model",
      label: "Marca e modelo",
      weight: 8,
      ok: Boolean(str(ad.brand) && str(ad.model)),
    },
    { key: "version", label: "Versão informada", weight: 5, ok: Boolean(str(ad.version)) },
    { key: "year", label: "Ano", weight: 6, ok: Boolean(str(ad.year) || str(ad.year_model)) },
    { key: "price", label: "Preço", weight: 10, ok: price != null && price > 0 },
    { key: "city", label: "Cidade/UF", weight: 8, ok: Boolean(str(ad.city) || str(ad.city_name)) },
    { key: "mileage", label: "Quilometragem", weight: 6, ok: num(ad.mileage ?? ad.km) != null },
    {
      key: "fuel",
      label: "Combustível",
      weight: 4,
      ok: Boolean(str(ad.fuel_type) || str(ad.fuel)),
    },
    { key: "transmission", label: "Câmbio", weight: 4, ok: Boolean(str(ad.transmission)) },
    { key: "color", label: "Cor", weight: 4, ok: Boolean(str(ad.color)) },
    { key: "photos", label: "Fotos suficientes (3+)", weight: 9, ok: imageCount >= 3 },
    { key: "main_image", label: "Imagem principal", weight: 3, ok: imageCount >= 1 },
    {
      key: "description",
      label: "Descrição mínima (120+)",
      weight: 8,
      ok: description.length >= 120,
    },
    { key: "fipe", label: "Referência FIPE", weight: 4, ok: fipe != null && fipe > 0 },
    {
      key: "fipe_delta",
      label: "Diferença para a FIPE",
      weight: 2,
      ok: price != null && fipe != null && fipe > 0,
    },
    { key: "advertiser", label: "Anunciante identificado", weight: 3, ok: Boolean(advertiser) },
    { key: "contact", label: "WhatsApp/telefone", weight: 4, ok: Boolean(contact) },
    { key: "status_active", label: "Status ativo (público)", weight: 2, ok: isActive(ad) },
    {
      key: "fresh",
      label: "Atualizado nos últimos 90 dias",
      weight: 2,
      ok: updatedWithinDays(ad, 90),
    },
  ];
}

const RECOMMENDATION_BY_KEY = {
  title: "Escreva um título claro com marca, modelo e versão.",
  brand_model: "Preencha marca e modelo — base para Product/Vehicle no JSON-LD.",
  version: "Informe a versão (ex.: 1.0 Flex, XEi) para qualificar o modelo.",
  year: "Informe o ano de fabricação/modelo.",
  price: "Defina um preço maior que zero — essencial para Offer e para a busca.",
  city: "Informe a cidade/UF — dá contexto local à página.",
  mileage: "Informe a quilometragem (mileageFromOdometer no JSON-LD).",
  fuel: "Informe o combustível.",
  transmission: "Informe o câmbio.",
  color: "Informe a cor.",
  photos: "Adicione pelo menos 3 fotos reais do veículo.",
  main_image: "Adicione ao menos uma foto — sem imagem o anúncio rende mal na busca visual.",
  description: "Escreva uma descrição com 120+ caracteres, específica e útil.",
  fipe: "Preencha a referência FIPE para mostrar a comparação de preço.",
  fipe_delta: "Com preço + FIPE preenchidos, a diferença para a FIPE aparece automaticamente.",
  advertiser: "Vincule um anunciante identificado.",
  contact: "Disponibilize WhatsApp/telefone permitido para contato.",
  status_active: "Apenas anúncios ativos aparecem publicamente e entram no sitemap.",
  fresh: "Atualize o anúncio — frescor (updated_at) melhora a leitura por buscadores.",
};

export function scoreBand(score) {
  if (score >= 80) return "pronto";
  if (score >= 50) return "aceitavel";
  return "fraco";
}

/**
 * Calcula o score SEO/IA (0..100) do anúncio.
 * @param {object} ad row do admin (a.* + joins) ou objeto compatível.
 */
export function calculateAdSeoAiScore(ad) {
  if (!ad || typeof ad !== "object") {
    return {
      score: 0,
      band: "fraco",
      checklist: [],
      missing: [],
      recommendations: ["Anúncio inválido."],
    };
  }

  const criteria = buildCriteria(ad);
  const earned = criteria.reduce((acc, c) => acc + (c.ok ? c.weight : 0), 0);
  const total = criteria.reduce((acc, c) => acc + c.weight, 0);
  const score = Math.round((earned / total) * 100);

  const checklist = criteria.map((c) => ({
    key: c.key,
    label: c.label,
    ok: c.ok,
    weight: c.weight,
  }));
  const missing = checklist.filter((c) => !c.ok).map((c) => c.label);
  const recommendations = criteria
    .filter((c) => !c.ok)
    .map((c) => RECOMMENDATION_BY_KEY[c.key])
    .filter(Boolean);

  return {
    score,
    band: scoreBand(score),
    suggested_image_alt: buildAdImageAlt(ad),
    checklist,
    missing,
    recommendations,
  };
}
