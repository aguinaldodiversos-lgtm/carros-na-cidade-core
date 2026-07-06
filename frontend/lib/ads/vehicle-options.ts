/**
 * Catálogo de OPCIONAIS do veículo (espelho do frontend).
 *
 * ESPELHO de `src/modules/ads/ad-options.catalog.js` (backend é a autoridade
 * de validação; este arquivo é usado para renderizar o seletor e a página
 * pública). O conjunto de keys/labels DEVE ficar idêntico ao backend — há
 * teste de sincronia em `tests/ads/ad-options-catalog-sync.test.js`.
 *
 * Dedupe de conceito (mesma regra do backend): cada conceito tem UMA key e
 * UMA categoria (primeira ocorrência na ordem comfort → drivability → safety).
 */

export type VehicleOptionCategory = "comfort" | "drivability" | "safety";

export type VehicleOptionItem = {
  key: string;
  label: string;
  category: VehicleOptionCategory;
  order: number;
};

export const VEHICLE_OPTION_CATEGORIES: VehicleOptionCategory[] = [
  "comfort",
  "drivability",
  "safety",
];

export const VEHICLE_OPTION_CATEGORY_LABELS: Record<VehicleOptionCategory, string> = {
  comfort: "Conforto",
  drivability: "Dirigibilidade",
  safety: "Segurança",
};

const COMFORT: [string, string][] = [
  ["ar_condicionado", "Ar-condicionado"],
  ["ar_condicionado_digital", "Ar-condicionado digital"],
  ["ar_condicionado_automatico", "Ar-condicionado automático"],
  ["bancos_couro", "Bancos em couro"],
  ["banco_motorista_regulagem_altura", "Banco do motorista com regulagem de altura"],
  ["banco_motorista_eletrico", "Banco do motorista elétrico"],
  ["bancos_dianteiros_aquecidos", "Bancos dianteiros aquecidos"],
  ["volante_regulagem_altura", "Volante com regulagem de altura"],
  ["volante_regulagem_profundidade", "Volante com regulagem de profundidade"],
  ["volante_multifuncional", "Volante multifuncional"],
  ["direcao_eletrica", "Direção elétrica"],
  ["direcao_hidraulica", "Direção hidráulica"],
  ["vidros_eletricos_dianteiros", "Vidros elétricos dianteiros"],
  ["vidros_eletricos_traseiros", "Vidros elétricos traseiros"],
  ["travas_eletricas", "Travas elétricas"],
  ["retrovisores_eletricos", "Retrovisores elétricos"],
  ["retrovisores_rebativeis_eletricamente", "Retrovisores rebatíveis eletricamente"],
  ["chave_presencial", "Chave presencial"],
  ["partida_botao", "Partida por botão"],
  ["piloto_automatico", "Piloto automático"],
  ["controle_velocidade_cruzeiro", "Controle de velocidade de cruzeiro"],
  ["sensor_chuva", "Sensor de chuva"],
  ["acendimento_automatico_farois", "Acendimento automático dos faróis"],
  ["teto_solar", "Teto solar"],
  ["teto_panoramico", "Teto panorâmico"],
  ["porta_malas_abertura_eletrica", "Porta-malas com abertura elétrica"],
  ["apoio_braco", "Apoio de braço"],
  ["descanso_braco_traseiro", "Descanso de braço traseiro"],
  ["saida_ar_traseira", "Saída de ar-condicionado para o banco traseiro"],
  ["carregador_inducao", "Carregador de celular por indução"],
  ["entrada_usb", "Entrada USB"],
  ["entrada_usb_traseira", "Entrada USB traseira"],
  ["bluetooth", "Bluetooth"],
  ["central_multimidia", "Central multimídia"],
  ["android_auto", "Android Auto"],
  ["apple_carplay", "Apple CarPlay"],
  ["gps_integrado", "GPS integrado"],
  ["camera_re", "Câmera de ré"],
  ["som_original_fabrica", "Som original de fábrica"],
  ["painel_digital", "Painel digital"],
  ["computador_bordo", "Computador de bordo"],
];

const DRIVABILITY: [string, string][] = [
  ["cambio_manual", "Câmbio manual"],
  ["cambio_automatico", "Câmbio automático"],
  ["cambio_automatizado", "Câmbio automatizado"],
  ["cambio_cvt", "Câmbio CVT"],
  ["tracao_dianteira", "Tração dianteira"],
  ["tracao_traseira", "Tração traseira"],
  ["tracao_4x4", "Tração 4x4"],
  ["tracao_integral_awd", "Tração integral AWD"],
  ["controle_estabilidade", "Controle de estabilidade"],
  ["controle_tracao", "Controle de tração"],
  ["assistente_partida_rampa", "Assistente de partida em rampa"],
  ["freio_estacionamento_eletronico", "Freio de estacionamento eletrônico"],
  ["auto_hold", "Auto Hold"],
  ["modo_economico", "Modo econômico"],
  ["modo_sport", "Modo Sport"],
  ["paddle_shift", "Paddle shift / borboletas no volante"],
  ["start_stop", "Start-stop"],
  ["sensor_estacionamento_traseiro", "Sensor de estacionamento traseiro"],
  ["sensor_estacionamento_dianteiro", "Sensor de estacionamento dianteiro"],
  ["camera_360", "Câmera 360°"],
  ["assistente_estacionamento", "Assistente de estacionamento"],
  ["farol_neblina", "Farol de neblina"],
  ["farois_led", "Faróis em LED"],
  ["farois_xenonio", "Faróis de xenônio"],
  ["farol_regulagem_altura", "Farol com regulagem de altura"],
  ["rodas_liga_leve", "Rodas de liga leve"],
  ["pneus_novos", "Pneus novos"],
  ["suspensao_revisada", "Suspensão revisada"],
  ["motor_revisado", "Motor revisado"],
  ["baixo_consumo", "Baixo consumo de combustível"],
  ["preco_competitivo_fipe", "Preço competitivo em relação à FIPE"],
  ["unico_dono", "Único dono"],
  ["todas_revisoes_feitas", "Todas as revisões feitas"],
  ["revisoes_concessionaria", "Revisões em concessionária"],
  ["manual_proprietario", "Manual do proprietário"],
  ["chave_reserva", "Chave reserva"],
];

const SAFETY: [string, string][] = [
  ["airbag_duplo", "Airbag duplo"],
  ["airbags_laterais", "Airbags laterais"],
  ["airbags_cortina", "Airbags de cortina"],
  ["airbag_joelho", "Airbag de joelho"],
  ["freios_abs", "Freios ABS"],
  ["distribuicao_eletronica_frenagem", "Distribuição eletrônica de frenagem"],
  ["assistente_frenagem_emergencia", "Assistente de frenagem de emergência"],
  ["alerta_colisao_frontal", "Alerta de colisão frontal"],
  ["frenagem_automatica_emergencia", "Frenagem automática de emergência"],
  ["alerta_ponto_cego", "Alerta de ponto cego"],
  ["alerta_mudanca_faixa", "Alerta de mudança de faixa"],
  ["assistente_permanencia_faixa", "Assistente de permanência em faixa"],
  ["isofix", "Isofix"],
  ["cinto_pre_tensionador", "Cinto de segurança com pré-tensionador"],
  ["encosto_cabeca_todos", "Encosto de cabeça para todos os ocupantes"],
  ["alarme", "Alarme"],
  ["imobilizador_eletronico", "Imobilizador eletrônico"],
  ["rastreador", "Rastreador"],
  ["monitoramento_pressao_pneus", "Monitoramento de pressão dos pneus"],
  ["sensor_estacionamento", "Sensor de estacionamento"],
  ["luz_diurna_led", "Luz diurna em LED"],
  ["desembacador_traseiro", "Desembaçador traseiro"],
  ["limpador_traseiro", "Limpador traseiro"],
  ["controle_automatico_descida", "Controle automático de descida"],
  ["assistente_subida", "Assistente de subida"],
  ["chamada_emergencia", "Chamada de emergência"],
  ["sistema_antifurto", "Sistema antifurto"],
  ["blindado", "Blindado"],
  ["laudo_cautelar_aprovado", "Laudo cautelar aprovado"],
];

function build(pairs: [string, string][], category: VehicleOptionCategory): VehicleOptionItem[] {
  return pairs.map(([key, label], order) => ({ key, label, category, order }));
}

export const VEHICLE_OPTIONS_CATALOG: VehicleOptionItem[] = [
  ...build(COMFORT, "comfort"),
  ...build(DRIVABILITY, "drivability"),
  ...build(SAFETY, "safety"),
];

const OPTION_BY_KEY = new Map(VEHICLE_OPTIONS_CATALOG.map((item) => [item.key, item]));

export const VEHICLE_OPTION_KEYS: string[] = Array.from(OPTION_BY_KEY.keys());

export type OptionGroup = {
  category: VehicleOptionCategory;
  label: string;
  items: { key: string; label: string }[];
};

/**
 * Chaves de PROCEDÊNCIA/verificação — as que viram os "selos verdes" no topo
 * do detalhe (item 6 do redesign detalhes.png), em vez de ficarem soltas na
 * lista de opcionais. São um subconjunto curado do catálogo (todas existem em
 * COMFORT/DRIVABILITY/SAFETY acima). Ordem = ordem de exibição dos selos.
 *
 * IMPORTANTE (LGPD/verdade): não existe coluna "IPVA pago" no modelo, então
 * esse selo do mockup NUNCA é renderizado — só exibimos o que o anunciante
 * realmente marcou em `vehicle_options`.
 *
 * Decisão 2026-07-05 (aprovada): estas chaves são EXTRAÍDAS dos grupos de
 * opcionais (via `excludeKeys`) para não aparecerem duplicadas.
 */
export const TRUST_BADGE_KEYS: string[] = [
  "unico_dono",
  "todas_revisoes_feitas",
  "revisoes_concessionaria",
  "manual_proprietario",
  "chave_reserva",
  "laudo_cautelar_aprovado",
  "blindado",
  "preco_competitivo_fipe",
];

export type TrustBadge = { key: string; label: string };

/**
 * ── Fase B (cura do cadastro) ────────────────────────────────────────────────
 * Câmbio e carroceria passam a ser CAPTURADOS no wizard/edição. Para o câmbio
 * ser FONTE ÚNICA (sem dois campos divergentes), o seletor de câmbio grava
 * `transmission` E sincroniza a chave `cambio_*` correspondente nos opcionais —
 * e as chaves de câmbio ficam ESCONDIDAS do seletor de opcionais manual.
 */
export const TRANSMISSION_CHOICES = ["Manual", "Automático", "Automatizado", "CVT"] as const;

export const BODY_TYPE_CHOICES = [
  "Hatch",
  "Sedã",
  "SUV",
  "Picape",
  "Coupé",
  "Minivan",
  "Perua",
] as const;

const TRANSMISSION_TO_CAMBIO_KEY: Record<string, string> = {
  Manual: "cambio_manual",
  Automático: "cambio_automatico",
  Automatizado: "cambio_automatizado",
  CVT: "cambio_cvt",
};

/** Todas as chaves de câmbio do catálogo (para esconder do seletor de opcionais). */
export const CAMBIO_OPTION_KEYS: string[] = Object.values(TRANSMISSION_TO_CAMBIO_KEY);

/**
 * Sincroniza a chave de câmbio nos opcionais com o câmbio escolhido: remove
 * qualquer `cambio_*` anterior e adiciona a do câmbio atual. Mantém o câmbio
 * como fonte única (o mesmo dado alimenta a coluna `transmission` e o opcional).
 */
export function syncCambioOptionKeys(keys: string[], transmissionLabel: string): string[] {
  const withoutCambio = keys.filter((k) => !CAMBIO_OPTION_KEYS.includes(k));
  const key = TRANSMISSION_TO_CAMBIO_KEY[transmissionLabel];
  return key ? [...withoutCambio, key] : withoutCambio;
}

/** Rótulo de câmbio ("Manual"...) a partir da chave `cambio_*` presente nas keys. */
export function transmissionLabelFromKeys(keys: string[]): string {
  const found = keys.find((k) => CAMBIO_OPTION_KEYS.includes(k));
  if (!found) return "";
  const entry = Object.entries(TRANSMISSION_TO_CAMBIO_KEY).find(([, v]) => v === found);
  return entry ? entry[0] : "";
}

/**
 * Entrada crua → selos de procedência selecionados, em ordem canônica do
 * `TRUST_BADGE_KEYS`, com label canônico do catálogo. Vazio quando o anúncio
 * não marcou nenhuma chave de procedência.
 */
export function buildTrustBadges(stored: unknown): TrustBadge[] {
  const selected = new Set(extractSelectedKeys(stored));
  const badges: TrustBadge[] = [];
  for (const key of TRUST_BADGE_KEYS) {
    if (!selected.has(key)) continue;
    const item = OPTION_BY_KEY.get(key);
    if (item) badges.push({ key, label: item.label });
  }
  return badges;
}

/** Catálogo agrupado por categoria — usado pelo seletor (checkboxes). */
export function getCatalogGroups(): OptionGroup[] {
  return VEHICLE_OPTION_CATEGORIES.map((category) => ({
    category,
    label: VEHICLE_OPTION_CATEGORY_LABELS[category],
    items: VEHICLE_OPTIONS_CATALOG.filter((item) => item.category === category).map((item) => ({
      key: item.key,
      label: item.label,
    })),
  }));
}

/**
 * Entrada crua (jsonb do backend: objeto agrupado, array de keys, string JSON
 * ou null) → conjunto de keys válidas selecionadas. Tolerante a formatos.
 */
export function extractSelectedKeys(stored: unknown): string[] {
  let raw = stored;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }

  const candidates: unknown[] = [];
  if (Array.isArray(raw)) {
    candidates.push(...raw);
  } else if (raw && typeof raw === "object") {
    for (const value of Object.values(raw as Record<string, unknown>)) {
      if (Array.isArray(value)) candidates.push(...value);
    }
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = String(candidate ?? "").trim();
    if (key && OPTION_BY_KEY.has(key)) seen.add(key);
  }
  return Array.from(seen);
}

/**
 * Entrada crua → grupos para EXIBIÇÃO pública: ordenados por categoria e por
 * ordem do catálogo, categorias vazias OMITIDAS. Sempre usa o label canônico
 * (texto puro — nunca renderiza texto vindo do cliente).
 */
export function buildSelectedOptionGroups(
  stored: unknown,
  opts?: { excludeKeys?: Iterable<string> }
): OptionGroup[] {
  const selected = new Set(extractSelectedKeys(stored));
  if (selected.size === 0) return [];

  const excluded = opts?.excludeKeys ? new Set(opts.excludeKeys) : null;

  const groups: OptionGroup[] = [];
  for (const category of VEHICLE_OPTION_CATEGORIES) {
    const items = VEHICLE_OPTIONS_CATALOG.filter(
      (item) =>
        item.category === category &&
        selected.has(item.key) &&
        !(excluded && excluded.has(item.key))
    ).map((item) => ({ key: item.key, label: item.label }));

    if (items.length > 0) {
      groups.push({ category, label: VEHICLE_OPTION_CATEGORY_LABELS[category], items });
    }
  }
  return groups;
}

/** Total de opcionais selecionados (para badges/contadores). */
export function countSelectedOptions(stored: unknown): number {
  return extractSelectedKeys(stored).length;
}
