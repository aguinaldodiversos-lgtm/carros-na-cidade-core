import type { DealerVehicleEvaluation } from "./dealer-api";

/**
 * "Pontos para avaliar" — o que a página pode dizer sem inventar (§19 e §20).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A REGRA QUE GOVERNA ESTE ARQUIVO
 * ════════════════════════════════════════════════════════════════════════════
 * Cada ponto é (a) a REPETIÇÃO de algo que o proprietário declarou, ou (b) a
 * aplicação de um limiar NUMÉRICO documentado aqui, em cima de um dado que já
 * está na tela.
 *
 * Nada mais entra. Em particular, não existe e não pode passar a existir:
 *
 *   "Excelente oportunidade"  "Baixo risco"      "Compra segura"
 *   "Alta margem"             "Atratividade: Boa"  nota de 0 a 100
 *   medidor verde/amarelo/vermelho                 ranking
 *
 * O §20 é explícito: nenhum score nesta fase. A diferença entre as duas listas
 * não é de tom — é de FONTE. "Quilometragem acima de 150.000 km" é verificável
 * contra o próprio número mostrado logo acima; "boa oportunidade" dependeria de
 * um modelo de precificação que este produto não tem.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * OS PONTOS SÃO ALERTAS, NUNCA ELOGIOS
 * ════════════════════════════════════════════════════════════════════════════
 * A lista só cresce com coisas que MERECEM UM SEGUNDO OLHAR. Um veículo sem
 * nenhum ponto não recebe "tudo certo" no lugar — recebe o silêncio, e o bloco
 * inteiro sai da tela. Um selo de aprovação seria exatamente o que o §17 proíbe:
 * a plataforma não verifica nada disto, só transporta a declaração.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * OS LIMIARES, DECLARADOS
 * ════════════════════════════════════════════════════════════════════════════
 * Estão em constantes nomeadas e exportadas para que o teste os leia daqui em
 * vez de repetir o número — um limiar copiado no teste deixa de ser o limiar do
 * produto no dia em que alguém mexe num dos dois.
 */

/**
 * Acima disto a quilometragem entra na lista.
 *
 * 150.000 km não é um veredito sobre o carro: é o ponto em que itens de desgaste
 * (embreagem, suspensão, correia, bateria em híbridos e elétricos) costumam ter
 * ciclo de troca vencido, e por isso é onde uma verificação presencial passa a
 * mudar de preço. O número está aqui, escrito, justamente para poder ser
 * discutido — e não escondido dentro de um `if`.
 */
export const HIGH_MILEAGE_KM = 150_000;

/**
 * Abaixo disto a galeria entra na lista.
 *
 * Com menos de quatro fotos não dá para cobrir frente, traseira, interior e
 * painel — os quatro ângulos que decidem se vale marcar uma visita. É uma
 * afirmação sobre a QUANTIDADE DE INFORMAÇÃO, não sobre o veículo.
 */
export const FEW_PHOTOS_THRESHOLD = 4;

export type OpportunityReviewPoint = {
  /** Chave estável — serve de `key` no React e de âncora no teste. */
  id: string;
  label: string;
};

/**
 * Monta a lista. Ordem fixa e determinística: a mesma solicitação produz sempre
 * a mesma sequência, então uma diferença entre duas cargas é sinal de que o dado
 * mudou — não de que a lista embaralhou.
 */
export function buildReviewPoints({
  mileage,
  images,
  evaluation,
}: {
  mileage: number | null | undefined;
  images: string[] | null | undefined;
  evaluation: DealerVehicleEvaluation | null | undefined;
}): OpportunityReviewPoint[] {
  const points: OpportunityReviewPoint[] = [];

  if (typeof mileage === "number" && Number.isFinite(mileage) && mileage >= HIGH_MILEAGE_KM) {
    points.push({
      id: "mileage",
      label: `Quilometragem acima de ${HIGH_MILEAGE_KM.toLocaleString("pt-BR")} km`,
    });
  }

  const photoCount = Array.isArray(images) ? images.length : 0;
  if (photoCount < FEW_PHOTOS_THRESHOLD) {
    points.push({
      id: "photos",
      label:
        photoCount === 0
          ? "Nenhuma foto disponível"
          : `Poucas fotos disponíveis (${photoCount})`,
    });
  }

  /*
    LAUDO CAUTELAR — três origens, uma frase.

    `null`            → a solicitação é anterior à ficha; ninguém perguntou;
    `"unknown"`       → perguntaram e a pessoa não soube informar;
    `"not_available"` → a pessoa disse que NÃO possui laudo.

    Os três chegam ao lojista como a mesma consequência prática: não existe laudo
    para ler. A frase diz isso, e não "não tem laudo" — que afirmaria sobre o
    veículo o que só se sabe sobre a declaração.

    Um laudo com resultado (aprovado, com apontamentos, reprovado) NÃO entra
    aqui: ele está na ficha declarada logo acima, com o resultado, e repeti-lo
    como "ponto de atenção" transformaria um laudo aprovado em alerta.
  */
  const caution = evaluation?.caution_report_status ?? null;
  if (caution == null || caution === "unknown" || caution === "not_available") {
    points.push({ id: "caution-report", label: "Sem laudo cautelar informado" });
  }

  // A partir daqui: repetição pura de declarações do proprietário. Cada uma tem
  // consequência direta no custo ou no risco da compra, e todas estão na ficha.
  if (evaluation?.auction_history === "yes") {
    points.push({ id: "auction", label: "Passagem por leilão declarada" });
  }

  if (evaluation?.collision_history === "yes") {
    points.push({ id: "collision", label: "Sinistro declarado pelo proprietário" });
  }

  if (evaluation?.financing_status === "yes") {
    points.push({ id: "financing", label: "Financiamento em aberto declarado" });
  }

  if (
    evaluation?.tire_condition === "half_life" ||
    evaluation?.tire_condition === "replace_soon" ||
    evaluation?.tire_condition === "replace_now"
  ) {
    const TIRE_POINT: Record<string, string> = {
      half_life: "Pneus declarados em meia-vida",
      replace_soon: "Pneus a trocar em breve, segundo o proprietário",
      replace_now: "Pneus a trocar, segundo o proprietário",
    };
    points.push({ id: "tires", label: TIRE_POINT[evaluation.tire_condition] });
  }

  // Mecânica com problema declarado. Um conjunto por vez, com o nome do
  // conjunto: "problema mecânico" genérico obrigaria a rolar até a ficha para
  // descobrir onde.
  const MECHANICAL: ReadonlyArray<[keyof DealerVehicleEvaluation, string, string]> = [
    ["engine_condition", "engine", "Motor com problema declarado"],
    ["gearbox_condition", "gearbox", "Câmbio com problema declarado"],
    ["suspension_condition", "suspension", "Suspensão com problema declarada"],
  ];

  for (const [field, id, label] of MECHANICAL) {
    if (evaluation?.[field] === "issue") points.push({ id, label });
  }

  return points;
}
