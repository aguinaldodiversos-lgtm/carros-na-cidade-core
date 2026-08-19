"use client";

import {
  NOT_INFORMED,
  formatMoneyValue,
  readBodyPaintIssue,
  readBodyPaintStatus,
  readCautionReport,
  readIpvaStatus,
  readLicensingStatus,
  readMechanicalCondition,
  readTireCondition,
  readYesNoUnknown,
  type BodyPaintIssue,
  type BodyPaintStatus,
  type CautionReportStatus,
  type IpvaStatus,
  type LicensingStatus,
  type MechanicalCondition,
  type TireCondition,
  type YesNoUnknown,
} from "@/lib/sale-requests/api";

/**
 * A ficha de avaliação do veículo — a MESMA para o dono e para o lojista.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE COMPARTILHAR ESTE COMPONENTE, E SÓ ELE
 * ────────────────────────────────────────────────────────────────────────────
 * Quem publica precisa poder confiar que a loja lê EXATAMENTE o que ele
 * declarou. Duas implementações da mesma ficha divergem na primeira correção de
 * rótulo — e o sintoma seria a tela do dono dizendo "Quitado" e a do lojista
 * dizendo outra coisa para a mesma linha do banco. Não há como um usuário
 * descobrir isso; os dois veem só a própria tela.
 *
 * O que NÃO foi compartilhado, de propósito: a tela do dono inteira. Ela carrega
 * o cancelamento, o status da solicitação e a contagem de fotos — ações e
 * rótulos que só fazem sentido para quem publicou.
 *
 * Aqui só existe LEITURA: nenhum callback, nenhum estado, nenhuma ação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UM CARTÃO COM SEÇÕES, E NÃO CINCO CARTÕES
 * ────────────────────────────────────────────────────────────────────────────
 * A versão anterior era uma grade de cinco cartões com borda, cada um com o seu
 * título e as suas linhas rótulo-à-esquerda/valor-à-direita. Visualmente isso
 * produzia dez bordas e cinco sombras para dezoito dados, e a leitura virava
 * linha a linha — o oposto de escanear.
 *
 * Agora é UM cartão, com as seções separadas por divisórias e cada dado num
 * bloco compacto de ícone + rótulo + valor. Menos caixas, mais densidade, e a
 * varredura acontece na horizontal.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * "NÃO INFORMADO" NUNCA VIRA "NÃO"
 * ────────────────────────────────────────────────────────────────────────────
 * Solicitações publicadas antes desta ficha existir têm NULL em todas as
 * colunas. NULL significa "a versão anterior do formulário não perguntou", e é
 * exibido como "Não informado" em cinza — visualmente distinto de um valor real.
 *
 * `'unknown'` é OUTRA coisa: a pessoa foi perguntada e respondeu "não sei
 * informar". Os dois chegam aqui separados e saem daqui separados.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O ESTADO NÃO É SÓ COR
 * ────────────────────────────────────────────────────────────────────────────
 * Cada dado carrega um GLIFO (✓ / ⚠ / ·) além da cor. Quem não distingue verde
 * de âmbar lê exatamente a mesma informação — e o glifo sobrevive a impressão em
 * preto e branco e a captura de tela em escala de cinza.
 */

export type VehicleEvaluationFields = {
  tire_condition: TireCondition | null;

  financing_status: YesNoUnknown | null;
  financing_balance: string | null;
  fines_status: YesNoUnknown | null;
  fines_amount: string | null;
  ipva_status: IpvaStatus | null;
  ipva_amount_due: string | null;
  licensing_status: LicensingStatus | null;

  caution_report_status: CautionReportStatus | null;
  auction_history: YesNoUnknown | null;
  collision_history: YesNoUnknown | null;

  engine_condition: MechanicalCondition | null;
  engine_notes: string | null;
  gearbox_condition: MechanicalCondition | null;
  gearbox_notes: string | null;
  suspension_condition: MechanicalCondition | null;
  suspension_notes: string | null;

  body_paint_status: BodyPaintStatus | null;
  body_paint_issues: BodyPaintIssue[] | null;
  body_paint_notes: string | null;
};

/**
 * Uma linha de dado, no formato rótulo-à-esquerda / valor-à-direita.
 *
 * Continua exportada porque a tela do DONO a usa no cartão "Dados do veículo",
 * que é dela e não desta ficha. Removê-la para "limpar" quebraria aquela tela
 * sem ganho nenhum aqui.
 */
export function DataRow({ label, value }: { label: string; value: string | null }) {
  const filled = Boolean(value);
  return (
    <div className="flex flex-col gap-0.5 border-b border-[#F2F4F7] py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-[13px] text-[#64748b]">{label}</dt>
      <dd
        className={`text-[13px] sm:text-right ${
          filled ? "font-semibold text-[#1D2440]" : "text-[#98A2B3]"
        }`}
      >
        {value || NOT_INFORMED}
      </dd>
    </div>
  );
}

/** Cartão simples. Exportado pelo mesmo motivo de `DataRow`. */
export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#E5E9F2] bg-white p-4">
      <h2 className="mb-1 text-[13px] font-bold text-[#161f34]">{title}</h2>
      <dl>{children}</dl>
    </section>
  );
}

type Tone = "good" | "warn" | "muted";

const TONE_GLYPH: Record<Tone, string> = { good: "✓", warn: "⚠", muted: "·" };
const TONE_CLASS: Record<Tone, string> = {
  good: "bg-[#ECFDF3] text-[#067647]",
  warn: "bg-[#FFF8F0] text-[#B54708]",
  muted: "bg-[#F2F4F7] text-[#98A2B3]",
};

/** Um dado da ficha: glifo de estado + rótulo + valor. */
function StatusItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone: Tone;
}) {
  const filled = Boolean(value);
  // Sem valor não há estado a afirmar: o glifo neutro evita que uma ausência
  // pareça aprovação.
  const effective: Tone = filled ? tone : "muted";

  return (
    <div className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] font-bold leading-none ${TONE_CLASS[effective]}`}
        aria-hidden="true"
      >
        {TONE_GLYPH[effective]}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] leading-tight text-[#98A2B3]">{label}</span>
        <span
          className={`block text-[13px] font-semibold leading-snug ${
            filled ? "text-[#1D2440]" : "text-[#98A2B3]"
          }`}
        >
          {value || NOT_INFORMED}
        </span>
      </span>
    </div>
  );
}

/** Um grupo de dados dentro do cartão único. */
function Group({
  title,
  children,
  first = false,
}: {
  title: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section className={first ? "" : "mt-4 border-t border-[#F2F4F7] pt-4"}>
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#98A2B3]">
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

/** Valor com um complemento monetário entre parênteses, quando houver. */
export function withAmount(base: string | null, amount: string | null): string | null {
  if (!base) return null;
  const money = formatMoneyValue(amount);
  return money ? `${base} (${money})` : base;
}

/** "sim" é problema em financiamento/multas/leilão/sinistro; "não" não é. */
function yesIsBad(value: YesNoUnknown | null): Tone {
  if (value === "yes") return "warn";
  if (value === "no") return "good";
  return "muted";
}

function mechanicalTone(value: MechanicalCondition | null): Tone {
  if (value === "ok") return "good";
  if (value === "issue") return "warn";
  return "muted";
}

const TIRE_TONE: Record<string, Tone> = {
  new: "good",
  good: "good",
  half_life: "warn",
  replace_soon: "warn",
  replace_now: "warn",
  unknown: "muted",
};

const CAUTION_TONE: Record<string, Tone> = {
  approved: "good",
  not_available: "muted",
  approved_with_notes: "warn",
  rejected: "warn",
  unknown: "muted",
};

const IPVA_TONE: Record<string, Tone> = {
  paid: "good",
  installments: "warn",
  open: "warn",
  unknown: "muted",
};

export default function VehicleEvaluationSheet({
  evaluation,
  declaredConditionLabel,
  /** Cartão extra da tela chamadora (ex.: "Dados do veículo"), acima da ficha. */
  leading,
  /**
   * Título do PRIMEIRO grupo (conservação declarada + pneus).
   *
   * ────────────────────────────────────────────────────────────────────────
   * POR QUE ISTO É UMA PROP, E NÃO UM VALOR FIXO
   * ────────────────────────────────────────────────────────────────────────
   * As duas telas que compartilham esta ficha têm VIZINHANÇAS diferentes, e o
   * título certo depende da vizinhança:
   *
   *   • no detalhe do LOJISTA existe, logo acima, um cartão "Resumo do veículo"
   *     com um dado rotulado "Estado geral". Um título de seção com o mesmo
   *     texto faz o leitor procurar a diferença entre os dois — por isso ali o
   *     grupo se chama "Conservação";
   *
   *   • na tela do DONO não existe esse resumo, e "Estado geral e pneus" é o
   *     texto que ele já conhece desde a Fase 4.2. Mudá-lo seria alterar a tela
   *     de quem publica por causa de uma decisão tomada na tela de quem compra.
   *
   * O default é o texto do DONO, de propósito: quem não passa nada continua
   * vendo exatamente o que via antes desta fase. Só o chamador que tem um bom
   * motivo — o lojista — precisa dizer o contrário.
   *
   * A alternativa seria duplicar o componente, e aí as duas cópias divergiriam
   * na primeira correção de rótulo de VALOR — que é justamente o que este
   * componente compartilhado existe para impedir.
   */
  conditionSectionTitle = "Estado geral e pneus",
}: {
  evaluation: VehicleEvaluationFields;
  declaredConditionLabel: string | null;
  leading?: React.ReactNode;
  conditionSectionTitle?: string;
}) {
  const bodyPaintIssuesLabel =
    Array.isArray(evaluation.body_paint_issues) && evaluation.body_paint_issues.length > 0
      ? evaluation.body_paint_issues.map(readBodyPaintIssue).filter(Boolean).join(", ")
      : null;

  const mechanicalNotes = [
    { label: "Motor", notes: evaluation.engine_notes },
    { label: "Câmbio", notes: evaluation.gearbox_notes },
    { label: "Suspensão", notes: evaluation.suspension_notes },
  ].filter((item) => Boolean(item.notes));

  return (
    <div className="grid gap-4">
      {leading}

      <div className="rounded-2xl border border-[#E5E9F2] bg-white p-4">
        <Group title={conditionSectionTitle} first>
          <StatusItem
            label="Estado declarado"
            value={declaredConditionLabel}
            tone={
              declaredConditionLabel === "Regular" ||
              declaredConditionLabel === "Precisa de reparos"
                ? "warn"
                : "good"
            }
          />
          <StatusItem
            label="Pneus"
            value={readTireCondition(evaluation.tire_condition)}
            tone={TIRE_TONE[String(evaluation.tire_condition)] ?? "muted"}
          />
        </Group>

        <Group title="Financeiro e documentação">
          <StatusItem
            label="Financiamento ativo"
            value={withAmount(
              readYesNoUnknown(evaluation.financing_status),
              evaluation.financing_balance
            )}
            tone={yesIsBad(evaluation.financing_status)}
          />
          <StatusItem
            label="Multas pendentes"
            value={withAmount(
              readYesNoUnknown(evaluation.fines_status),
              evaluation.fines_amount
            )}
            tone={yesIsBad(evaluation.fines_status)}
          />
          <StatusItem
            label="IPVA"
            value={withAmount(readIpvaStatus(evaluation.ipva_status), evaluation.ipva_amount_due)}
            tone={IPVA_TONE[String(evaluation.ipva_status)] ?? "muted"}
          />
          <StatusItem
            label="Licenciamento"
            value={readLicensingStatus(evaluation.licensing_status)}
            tone={
              evaluation.licensing_status === "ok"
                ? "good"
                : evaluation.licensing_status === "pending"
                  ? "warn"
                  : "muted"
            }
          />
        </Group>

        <Group title="Histórico">
          <StatusItem
            label="Laudo cautelar"
            value={readCautionReport(evaluation.caution_report_status)}
            tone={CAUTION_TONE[String(evaluation.caution_report_status)] ?? "muted"}
          />
          <StatusItem
            label="Passagem por leilão"
            value={readYesNoUnknown(evaluation.auction_history)}
            tone={yesIsBad(evaluation.auction_history)}
          />
          <StatusItem
            label="Colisão ou sinistro"
            value={readYesNoUnknown(evaluation.collision_history)}
            tone={yesIsBad(evaluation.collision_history)}
          />
        </Group>

        <Group title="Mecânica">
          <StatusItem
            label="Motor"
            value={readMechanicalCondition(evaluation.engine_condition)}
            tone={mechanicalTone(evaluation.engine_condition)}
          />
          <StatusItem
            label="Câmbio"
            value={readMechanicalCondition(evaluation.gearbox_condition)}
            tone={mechanicalTone(evaluation.gearbox_condition)}
          />
          <StatusItem
            label="Suspensão"
            value={readMechanicalCondition(evaluation.suspension_condition)}
            tone={mechanicalTone(evaluation.suspension_condition)}
          />
        </Group>

        {/*
          As descrições de problema vêm DEPOIS da grade, agrupadas, e não
          intercaladas entre os itens: um parágrafo no meio de uma grade de três
          colunas quebra o alinhamento de todos os itens seguintes.
        */}
        {mechanicalNotes.length > 0 ? (
          <div className="mt-3 space-y-2">
            {mechanicalNotes.map((item) => (
              <p
                key={item.label}
                className="whitespace-pre-line rounded-lg bg-[#F9FBFF] px-3 py-2 text-[12px] leading-relaxed text-[#475467]"
              >
                <span className="font-semibold text-[#1D2440]">{item.label}: </span>
                {item.notes}
              </p>
            ))}
          </div>
        ) : null}

        <Group title="Lataria e pintura">
          <StatusItem
            label="Situação"
            value={readBodyPaintStatus(evaluation.body_paint_status)}
            tone={
              evaluation.body_paint_status === "none"
                ? "good"
                : evaluation.body_paint_status === "issues"
                  ? "warn"
                  : "muted"
            }
          />
          {/*
            A linha de detalhes só existe quando o estado declarado é "possui
            detalhes". Mostrá-la vazia para quem respondeu "nenhum detalhe"
            sugeriria uma pergunta sem resposta onde a resposta foi dada.
          */}
          {evaluation.body_paint_status === "issues" ? (
            <StatusItem label="Detalhes" value={bodyPaintIssuesLabel} tone="warn" />
          ) : null}
          {evaluation.body_paint_notes ? (
            <StatusItem label="Onde" value={evaluation.body_paint_notes} tone="warn" />
          ) : null}
        </Group>
      </div>
    </div>
  );
}
