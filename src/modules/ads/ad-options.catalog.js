/**
 * Catálogo canônico de OPCIONAIS do veículo — fonte da verdade de VALIDAÇÃO.
 *
 * Cada item tem:
 *   - key:      chave interna estável (snake_case, nunca muda — é o que vai pro banco)
 *   - label:    rótulo público em pt-BR (texto puro, sem HTML)
 *   - category: 'comfort' | 'drivability' | 'safety'
 *   - order:    ordem de exibição dentro da categoria
 *
 * Persistência: coluna `ads.vehicle_options` JSONB no formato agrupado
 *   { comfort: [keys], drivability: [keys], safety: [keys] }
 * (categorias sem seleção são omitidas). O backend é a autoridade: qualquer
 * key fora deste catálogo é IGNORADA na normalização (não quebra o save).
 *
 * Dedupe de conceito: alguns itens aparecem em mais de uma categoria no
 * briefing (ex.: "Controle de estabilidade" em Dirigibilidade e Segurança).
 * Para evitar duplicidade (regra do projeto), cada CONCEITO tem UMA key e UMA
 * categoria — mantida na PRIMEIRA categoria em que aparece (ordem
 * comfort → drivability → safety):
 *   - controle_estabilidade, controle_tracao → drivability
 *   - camera_re → comfort
 *   - farol_neblina → drivability ("Faróis de neblina" da Segurança vira o mesmo conceito)
 *
 * IMPORTANTE: este arquivo é espelhado em `frontend/lib/ads/vehicle-options.ts`
 * (front e back são pacotes separados). O conjunto de keys/labels DEVE ficar
 * idêntico — há teste de sincronia (tests/ads/ad-options-catalog-sync.test.js).
 */

export const VEHICLE_OPTION_CATEGORIES = Object.freeze(["comfort", "drivability", "safety"]);

export const VEHICLE_OPTION_CATEGORY_LABELS = Object.freeze({
  comfort: "Conforto",
  drivability: "Dirigibilidade",
  safety: "Segurança",
});

const COMFORT = [
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

const DRIVABILITY = [
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

const SAFETY = [
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

function buildCategory(pairs, category) {
  return pairs.map(([key, label], index) => ({ key, label, category, order: index }));
}

export const VEHICLE_OPTIONS_CATALOG = Object.freeze([
  ...buildCategory(COMFORT, "comfort"),
  ...buildCategory(DRIVABILITY, "drivability"),
  ...buildCategory(SAFETY, "safety"),
]);

/** Mapa key → { label, category, order } para lookup O(1) na normalização. */
const OPTION_BY_KEY = new Map(VEHICLE_OPTIONS_CATALOG.map((item) => [item.key, item]));

export const VEHICLE_OPTION_KEYS = Object.freeze(Array.from(OPTION_BY_KEY.keys()));

export function isValidVehicleOptionKey(key) {
  return OPTION_BY_KEY.has(String(key));
}

/**
 * Extrai todas as keys candidatas de uma entrada arbitrária do cliente.
 * Aceita:
 *   - array de keys: ["ar_condicionado", ...]
 *   - objeto agrupado: { comfort: [...], drivability: [...], ... }
 *   - qualquer objeto cujos valores sejam arrays de strings (re-agrupamos
 *     pela categoria AUTORITATIVA do catálogo, então a categoria enviada
 *     pelo cliente é irrelevante).
 */
function collectCandidateKeys(input) {
  if (input == null) return [];
  if (Array.isArray(input)) return input;

  if (typeof input === "object") {
    const keys = [];
    for (const value of Object.values(input)) {
      if (Array.isArray(value)) {
        keys.push(...value);
      }
    }
    return keys;
  }

  return [];
}

/**
 * Normaliza opcionais para persistência: allowlist + reagrupamento por
 * categoria canônica + dedupe + ordenação. Retorna objeto agrupado com
 * APENAS categorias não vazias. Entrada inválida/vazia → {}.
 *
 * Keys desconhecidas são ignoradas silenciosamente (forward-compat seguro).
 */
export function normalizeVehicleOptions(input) {
  const candidates = collectCandidateKeys(input);
  const seen = new Set();
  const buckets = { comfort: [], drivability: [], safety: [] };

  for (const raw of candidates) {
    const key = String(raw || "").trim();
    if (!key || seen.has(key)) continue;
    const item = OPTION_BY_KEY.get(key);
    if (!item) continue; // key fora do catálogo → ignora
    seen.add(key);
    buckets[item.category].push(item);
  }

  const result = {};
  for (const category of VEHICLE_OPTION_CATEGORIES) {
    const items = buckets[category];
    if (items.length === 0) continue;
    items.sort((a, b) => a.order - b.order);
    result[category] = items.map((item) => item.key);
  }

  return result;
}

/** Lista achatada de keys válidas a partir do objeto agrupado (ou qualquer entrada). */
export function flattenVehicleOptions(input) {
  const grouped = normalizeVehicleOptions(input);
  return VEHICLE_OPTION_CATEGORIES.flatMap((category) => grouped[category] || []);
}
