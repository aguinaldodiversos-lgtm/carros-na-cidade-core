/**
 * Guard de saída da sugestão de descrição (Fase 4.5).
 *
 * O prompt reduz a frequência de violação; ESTE arquivo é o que garante. A
 * premissa do briefing é que o anunciante clica em "gerar" e publica sem
 * reler — então a trava tem que estar na geração, não na revisão humana.
 *
 * Estratégia: filtro por FRASE, não por texto inteiro.
 *   - reprovar o texto todo por um deslize desperdiça uma geração boa;
 *   - apagar palavra solta deixa frase quebrada no meio.
 * Derrubar a frase inteira mantém a prosa gramatical e é determinístico.
 *
 * Ordem do pipeline (a ordem importa):
 *   1. limpa markdown / aspas / bullets
 *   2. normaliza (minúscula, sem acento, pontuação → espaço)
 *   3. MASCARA o vocabulário declarado — antes de qualquer busca. Sem isso,
 *      "Ar-condicionado digital" (marcado) dispararia o alarme de
 *      "Ar-condicionado" (não marcado), do qual é superstring.
 *   4. aplica proibições incondicionais (preço, FIPE, CTA, urgência, elogio)
 *   5. aplica proibições condicionais (só liberadas pela key correspondente)
 *   6. varre TODO item do catálogo que não foi marcado
 *   7. trunca em 1000 (limite do campo)
 */

import { VEHICLE_OPTIONS_CATALOG } from "../ad-options.catalog.js";

export const DESCRIPTION_MAX_CHARS = 1000;
/** Abaixo disso não é sugestão, é fragmento — melhor devolver erro. */
export const DESCRIPTION_MIN_CHARS = 120;

const MASK = "###";

/** minúscula, sem acento, pontuação e hífen viram espaço, espaços colapsados. */
export function normalizeForMatch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Proibições INCONDICIONAIS — nenhum campo do formulário libera.
 * Cada entrada é [regex sobre o texto normalizado, rótulo do motivo].
 */
/**
 * Padrões conferidos no texto CRU, antes de normalizar.
 *
 * `normalizeForMatch` troca tudo que não é letra/dígito por espaço — então
 * "R$" vira "r " e qualquer regex com `\$` nunca dispara. Cifrão e formato de
 * moeda brasileiro precisam ser vistos antes dessa limpeza.
 */
const RAW_BANS = Object.freeze([
  [/R\$|\bUS\$|€/i, "preco"],
  [/\d{1,3}(\.\d{3})+,\d{2}\b/, "preco"],
  [/\b\d+\s*mil\s+(reais|conto)/i, "preco"],
]);

const HARD_BANS = Object.freeze([
  // Preço e tabela
  [
    /\b(preco|precos|valor|valores|reais|parcela|parcelas|financiamento|financiado|financia|consorcio|desconto|barato|promocao)\b/,
    "preco",
  ],
  // "entrada" só é preço com contexto de dinheiro. Sozinha é palavra comum e
  // legítima em anúncio: "a Sense de entrada" (versão de entrada) e "entrada
  // USB" são as duas formas que apareceram em teste. Banir a palavra crua
  // derrubava o parágrafo de posicionamento inteiro.
  [/\bentrada\s+(de\s+)?(r\s*\$|\d)/, "preco"],
  [/\b(sem|com)\s+entrada\b/, "preco"],
  [/\bfipe\b/, "fipe"],
  [/\btabela\b/, "fipe"],
  [/\b(abaixo|acima) (da|do) (tabela|mercado)\b/, "fipe"],
  [/\b(aceita|aceito|aceitamos) (troca|trocas)\b/, "troca"],
  [/\btest\s*drive\b/, "cta"],
  // Chamada para ação / contato
  [
    /\b(entre em contato|fale conosco|fale comigo|chame|chama|ligue|liga|whatsapp|zap|agende|agendar|marque|marcar|venha|visite|visita|confira|saiba mais|consulte|nos chame|estamos a disposicao)\b/,
    "cta",
  ],
  // Urgência
  [
    /\b(aproveite|nao perca|antes que|ultima chance|imperdivel|corra|so hoje|unica oportunidade|oportunidade unica|garanta o seu)\b/,
    "urgencia",
  ],
  // Elogio vazio / estado de conservação não declarado
  [
    /\b(impecavel|excelente estado|otimo estado|bom estado|estado de conservacao|conservado|conservada|conservadissimo|novinho|semi novo|seminovo|zerado|bonito|bonita|lindo|linda|moderno|moderna|robusto|robusta|elegante|imponente|marcante|marcantes|custo beneficio|joia|relíquia|reliquia|pronto para rodar|so rodar|nada a fazer|nada para fazer|top de linha)\b/,
    "elogio",
  ],
  // Fatos inventados clássicos de classificado
  [
    /\b(nunca bateu|sem batida|sem batidas|sem detalhes|sem retoque|sem retoques|documentacao em dia|documento em dia|doc em dia|ipva pago|ipva quitado|sem multa|sem multas|sem debito|sem debitos|quitado|garantia de fabrica|na garantia)\b/,
    "fato_inventado",
  ],
  // Consumo numérico — o modelo chuta e erra
  [/\d+([.,]\d+)?\s*km\s*(l|por litro)\b/, "consumo"],
  [/\b(faz|fazendo|media de)\s+\d+([.,]\d+)?\s*(km|kml)\b/, "consumo"],
  // Identificação de loja / vendedor
  [/\b(nossa loja|nossa revenda|nosso estoque|nossa equipe|nos da|revenda)\b/, "loja"],
]);

/**
 * Proibições CONDICIONAIS: o termo só pode aparecer se pelo menos uma das
 * keys estiver marcada. Cobre (a) os fatos que o briefing proíbe inventar mas
 * que existem como checkbox no catálogo, e (b) os opcionais que o modelo mais
 * alucina, em variantes de redação que a varredura de rótulo exato não pega
 * ("ABS" solto, "sensor de ré", "bancos de couro").
 */
const CONDITIONAL_BANS = Object.freeze([
  [
    /\b(unico dono|primeiro dono|segundo dono|um dono|dois donos|donos|dono)\b/,
    ["unico_dono"],
    "dono",
  ],
  [
    /\b(revisao|revisoes|revisado|revisada|revisadas|revisados|manutencao|manutencoes|historico de manutencao)\b/,
    ["todas_revisoes_feitas", "revisoes_concessionaria", "motor_revisado", "suspensao_revisada"],
    "revisao",
  ],
  [/\b(concessionaria|concessionarias)\b/, ["revisoes_concessionaria"], "revisao"],
  [/\bpneus novos\b/, ["pneus_novos"], "pneus"],
  [/\blaudo\b/, ["laudo_cautelar_aprovado"], "laudo"],
  [/\bmanual do proprietario\b/, ["manual_proprietario"], "manual"],
  [/\bchave reserva\b/, ["chave_reserva"], "chave"],
  [/\bblindad[oa]\b/, ["blindado"], "blindado"],
  [/\bbaixo consumo\b/, ["baixo_consumo"], "consumo"],

  // Opcionais de alta alucinação
  [/\babs\b/, ["freios_abs"], "opcional"],
  [
    /\bairbags?\b/,
    ["airbag_duplo", "airbags_laterais", "airbags_cortina", "airbag_joelho"],
    "opcional",
  ],
  [
    /\bar condicionado\b/,
    ["ar_condicionado", "ar_condicionado_digital", "ar_condicionado_automatico"],
    "opcional",
  ],
  [/\bdirecao hidraulica\b/, ["direcao_hidraulica"], "opcional"],
  [/\bdirecao eletrica\b/, ["direcao_eletrica"], "opcional"],
  [
    /\bvidros? eletricos?\b/,
    ["vidros_eletricos_dianteiros", "vidros_eletricos_traseiros"],
    "opcional",
  ],
  [/\btravas? eletricas?\b/, ["travas_eletricas"], "opcional"],
  [/\bcamera de re\b/, ["camera_re"], "opcional"],
  [/\bcamera 360\b/, ["camera_360"], "opcional"],
  [/\bsensores? de re\b/, ["sensor_estacionamento_traseiro", "sensor_estacionamento"], "opcional"],
  [/\bmultimidia\b/, ["central_multimidia"], "opcional"],
  [/\bcouro\b/, ["bancos_couro"], "opcional"],
  [/\bteto solar\b/, ["teto_solar"], "opcional"],
  [/\bteto panoramico\b/, ["teto_panoramico"], "opcional"],
  [/\brodas? de liga\b/, ["rodas_liga_leve"], "opcional"],
  [/\bisofix\b/, ["isofix"], "opcional"],
  [/\balarme\b/, ["alarme"], "opcional"],
  [/\bpiloto automatico\b/, ["piloto_automatico"], "opcional"],
  [/\bcomputador de bordo\b/, ["computador_bordo"], "opcional"],
  [/\bpainel digital\b/, ["painel_digital"], "opcional"],
  [/\bbluetooth\b/, ["bluetooth"], "opcional"],
  [/\bcarplay\b/, ["apple_carplay"], "opcional"],
  [/\bandroid auto\b/, ["android_auto"], "opcional"],
  [/\bgps\b/, ["gps_integrado"], "opcional"],
  [/\bstart stop\b/, ["start_stop"], "opcional"],
  [/\bcontrole de estabilidade\b/, ["controle_estabilidade"], "opcional"],
  [/\bcontrole de tracao\b/, ["controle_tracao"], "opcional"],
  [/\b(farol|farois) de neblina\b/, ["farol_neblina"], "opcional"],
  [/\bxenonio\b/, ["farois_xenonio"], "opcional"],
  [/\brastreador\b/, ["rastreador"], "opcional"],
  [/\bteto\b/, ["teto_solar", "teto_panoramico"], "opcional"],
  [/\b4x4\b/, ["tracao_4x4"], "opcional"],
  [/\bawd\b/, ["tracao_integral_awd"], "opcional"],
]);

/** Rótulos normalizados de TODO item do catálogo, para a varredura final. */
const CATALOG_NORMALIZED = VEHICLE_OPTIONS_CATALOG.map((o) => ({
  key: o.key,
  label: o.label,
  normalized: normalizeForMatch(o.label),
}));

/** Remove markdown, bullets e aspas envolventes. Não rejeita — limpa. */
export function stripFormatting(raw) {
  let text = String(raw ?? "");

  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/`+/g, "");
  text = text.replace(/\*\*+/g, "");
  text = text.replace(/(^|\s)[*_]{1,2}(\S)/g, "$1$2");
  text = text.replace(/(\S)[*_]{1,2}(\s|$)/g, "$1$2");
  text = text.replace(/^\s{0,3}#{1,6}\s*/gm, "");
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  text = text.replace(/^\s{0,3}([-–—•*]|\d+[.)])\s+/gm, "");
  text = text.replace(/\r\n?/g, "\n");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  // Aspas que o modelo às vezes põe em volta da resposta inteira.
  const paired =
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith("“") && text.endsWith("”"));
  if (paired && text.length > 2) {
    text = text.slice(1, -1).trim();
  }

  return text;
}

/** Mascara os termos declarados, do mais longo para o mais curto. */
function maskDeclared(normalizedText, declaredVocabulary) {
  const terms = declaredVocabulary
    .map((t) => normalizeForMatch(t))
    .filter((t) => t.length >= 3)
    .sort((a, b) => b.length - a.length);

  let masked = normalizedText;
  for (const term of terms) {
    if (!term) continue;
    masked = masked.split(term).join(MASK);
  }
  return masked;
}

/**
 * Motivo de reprovação de UMA frase, ou `null` se estiver limpa.
 * Exportado para o teste conseguir afirmar o porquê, não só o efeito.
 */
export function findViolation(sentence, { declaredVocabulary = [], selectedKeys = [] } = {}) {
  for (const [pattern, reason] of RAW_BANS) {
    if (pattern.test(String(sentence ?? ""))) return { reason, term: pattern.source };
  }

  const normalized = normalizeForMatch(sentence);
  if (!normalized) return null;

  const masked = maskDeclared(normalized, declaredVocabulary);
  const selected = new Set(selectedKeys);
  const padded = ` ${masked} `;

  for (const [pattern, reason] of HARD_BANS) {
    if (pattern.test(masked)) return { reason, term: pattern.source };
  }

  for (const [pattern, keys, reason] of CONDITIONAL_BANS) {
    const declared = keys.some((k) => selected.has(k));
    if (declared) continue;
    if (pattern.test(masked)) return { reason, term: pattern.source };
  }

  for (const item of CATALOG_NORMALIZED) {
    if (selected.has(item.key)) continue;
    if (!item.normalized || item.normalized.length < 4) continue;
    if (padded.includes(` ${item.normalized} `)) {
      return { reason: "opcional_nao_marcado", term: item.label };
    }
  }

  return null;
}

/**
 * Divide em frases SEM partir número nem abreviação.
 *
 * A versão ingênua casava "tudo até o próximo .!?" e quebrava em TODO ponto; o
 * `join(" ")` devolvia "2. 0" no lugar de "2.0" e "110. 000" no lugar de
 * "110.000" — corrupção visível no textarea, em cima justamente da versão e da
 * quilometragem, que são o miolo da ficha. Pior: partia "R$ 94.900,00" em
 * "R$ 94." + "900,00...", e o pedaço com o preço escapava do filtro.
 *
 * Só corta quando o ponto é seguido de espaço E de início de frase
 * (maiúscula, aspas ou parêntese). "Dies. 16V" e "2.0" não casam.
 */
function splitSentences(paragraph) {
  return paragraph
    .split(/(?<=[.!?…])\s+(?=["'“(¿¡A-ZÀ-ÖØ-Þ])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Corta em `max` sem partir frase (ou, no pior caso, sem partir palavra). */
function truncate(text, max) {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const lastSentence = Math.max(
    head.lastIndexOf("."),
    head.lastIndexOf("!"),
    head.lastIndexOf("?")
  );
  if (lastSentence >= DESCRIPTION_MIN_CHARS) return head.slice(0, lastSentence + 1).trim();
  const lastSpace = head.lastIndexOf(" ");
  return (lastSpace > 0 ? head.slice(0, lastSpace) : head).trim();
}

/**
 * Aplica o guard completo.
 *
 * @param {string} raw texto cru do modelo
 * @param {{ declaredVocabulary?: string[], selectedKeys?: string[] }} ctx
 * @returns {{ ok: true, text: string, droppedSentences: number, reasons: string[] }
 *          | { ok: false, reason: string, droppedSentences?: number, reasons?: string[] }}
 */
export function guardDescription(raw, ctx = {}) {
  const cleaned = stripFormatting(raw);
  if (!cleaned) return { ok: false, reason: "empty" };

  const reasons = [];
  let dropped = 0;

  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);

  const keptParagraphs = [];
  for (const paragraph of paragraphs) {
    const kept = [];
    for (const sentence of splitSentences(paragraph)) {
      const violation = findViolation(sentence, ctx);
      if (violation) {
        dropped += 1;
        reasons.push(violation.reason);
        continue;
      }
      kept.push(sentence.trim());
    }
    if (kept.length) keptParagraphs.push(kept.join(" "));
  }

  const text = truncate(keptParagraphs.join("\n\n").trim(), DESCRIPTION_MAX_CHARS);

  if (text.length < DESCRIPTION_MIN_CHARS) {
    return { ok: false, reason: "too_short_after_guard", droppedSentences: dropped, reasons };
  }

  return { ok: true, text, droppedSentences: dropped, reasons };
}

export const __testing = {
  RAW_BANS,
  HARD_BANS,
  CONDITIONAL_BANS,
  CATALOG_NORMALIZED,
  maskDeclared,
  splitSentences,
};
