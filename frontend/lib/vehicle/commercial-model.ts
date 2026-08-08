/**
 * MODELO COMERCIAL — espelho byte-a-byte de
 * `src/shared/vehicle/commercial-model.js`.
 *
 * Leia a documentação completa (por que a camada existe, a escada de
 * resolução e o contrato de "nunca inventar") no arquivo do backend. Resumo:
 * `ads.model` guarda a DESCRIÇÃO FIPE inteira ("ONIX SEDAN Plus LT 1.0 12V
 * Flex 4p Mec."), não o modelo comercial. Sem esta camada, um Onix com 6
 * anúncios vira 4 clusters de 2/2/1/1 — todos abaixo do limiar de indexação.
 *
 * O teste de sincronia (`commercial-model.test.ts`) roda as MESMAS fixtures do
 * backend. Se os dois lados divergirem, um link gerado num lado não resolve no
 * outro.
 */
import { brandModelSlug, canonicalBrandSlug, canonicalBrandLabel } from "@/lib/seo/brand-model-slug";

export type CommercialModelSource = "override" | "compound" | "derived";

export interface CommercialModel {
  label: string;
  slug: string;
  source: CommercialModelSource;
}

/** Degrau 1 — overrides curados. Chave: `${brandSlug}::${primeiroTokenSlug}`. */
const COMMERCIAL_MODEL_OVERRIDES: Record<string, string> = {
  "omoda::5": "Omoda 5",
};

/** Degrau 2 — modelos comerciais compostos do mercado brasileiro. */
const COMPOUND_COMMERCIAL_MODELS: readonly string[] = [
  "Corolla Cross",
  "Grand Siena",
  "Grand Cherokee",
  "Range Rover Evoque",
  "Range Rover Sport",
  "Range Rover Velar",
  "Discovery Sport",
  "Nova Saveiro",
  "Novo Uno",
  "Up Cross",
  "Golf Variant",
  "Jetta Variant",
  "Passat Variant",
  "Master Furgão",
  "Kangoo Express",
  "Express Furgão",
];

const DISPLACEMENT_RE = /^\d+[.,]\d+$/;
const VALVES_RE = /^\d+v$/i;
const DOORS_RE = /^\d+p\.?$/i;
const STOP_TOKENS = new Set([
  "4x2",
  "4x4",
  "awd",
  "fwd",
  "rwd",
  "tb",
  "tsi",
  "thp",
  "msi",
  "mpi",
  "gdi",
  "turbo",
  "flex",
  "flexone",
  "gasolina",
  "alcool",
  "álcool",
  "etanol",
  "diesel",
  "eletrico",
  "elétrico",
  "hibrido",
  "híbrido",
  "gnv",
  "aut",
  "aut.",
  "mec",
  "mec.",
  "manual",
  "automatico",
  "automático",
  "cvt",
  "cs",
  "cd",
]);

function isStopToken(token: string): boolean {
  const t = String(token || "").toLowerCase();
  if (!t) return true;
  if (DISPLACEMENT_RE.test(t)) return true;
  if (VALVES_RE.test(t)) return true;
  if (DOORS_RE.test(t)) return true;
  return STOP_TOKENS.has(t);
}

/** Token com dígito ou hífen é PRESERVADO ("HB20", "HR-V"); o resto vira title-case. */
function displayCaseToken(token: string): string {
  const raw = String(token || "").trim();
  if (!raw) return "";
  if (/[0-9-]/.test(raw)) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function tokenize(value: string | null | undefined): string[] {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function matchCompound(tokens: string[]): string | null {
  const lowered = tokens.map((t) => t.toLowerCase());
  const candidates = [...COMPOUND_COMMERCIAL_MODELS].sort(
    (a, b) => tokenize(b).length - tokenize(a).length
  );

  for (const candidate of candidates) {
    const parts = tokenize(candidate).map((t) => t.toLowerCase());
    if (parts.length > lowered.length) continue;
    if (parts.every((part, i) => part === lowered[i])) return candidate;
  }

  return null;
}

/**
 * Deriva o modelo comercial da descrição FIPE. Devolve `null` quando não é
 * seguro decidir — o anúncio então não entra nos módulos/sitemaps de modelo
 * (segue descoberto pela cidade e pela marca).
 */
export function deriveCommercialModel(
  rawModel: string | null | undefined,
  options: { brand?: string | null } = {}
): CommercialModel | null {
  const tokens = tokenize(rawModel);
  if (tokens.length === 0) return null;

  const brandSlug = canonicalBrandSlug(options.brand);

  const overrideKey = `${brandSlug}::${brandModelSlug(tokens[0])}`;
  const override = COMMERCIAL_MODEL_OVERRIDES[overrideKey];
  if (override) {
    return { label: override, slug: brandModelSlug(override), source: "override" };
  }

  const compound = matchCompound(tokens);
  if (compound) {
    return { label: compound, slug: brandModelSlug(compound), source: "compound" };
  }

  const head = tokens[0];
  if (isStopToken(head)) return null;

  if (/^\d+$/.test(head)) {
    const brandLabel = canonicalBrandLabel(options.brand);
    if (!brandLabel) return null;
    const label = `${brandLabel} ${head}`;
    return { label, slug: brandModelSlug(label), source: "derived" };
  }

  const label = displayCaseToken(head);
  const slug = brandModelSlug(label);
  if (!slug) return null;

  return { label, slug, source: "derived" };
}

export function commercialModelSlug(
  rawModel: string | null | undefined,
  options: { brand?: string | null } = {}
): string {
  return deriveCommercialModel(rawModel, options)?.slug ?? "";
}

export function commercialModelLabel(
  rawModel: string | null | undefined,
  options: { brand?: string | null } = {}
): string {
  return deriveCommercialModel(rawModel, options)?.label ?? "";
}
