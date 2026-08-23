/**
 * Contrato compartilhado da AVALIAÇÃO PRESENCIAL e da PROPOSTA FINAL (Fase 4.5).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESPELHO de `src/modules/sale-requests/sale-requests.inspection.constants.js`
 * ────────────────────────────────────────────────────────────────────────────
 * Compartilhado entre as duas telas — a do proprietário e a do lojista — pelo
 * mesmo motivo que os rótulos da ficha declarada são: as duas pontas precisam
 * dizer a MESMA coisa sobre a mesma linha do banco. Duas tabelas de rótulos
 * produziriam a pior classe de defeito deste produto: a loja registrando
 * "Pneus: precisam ser trocados" e o proprietário lendo outra coisa.
 *
 * Os vocabulários de CONDIÇÃO não são redeclarados aqui: vêm de `./api`, que já
 * os espelha da ficha declarada (migration 054). É o que permite a frase
 * "declarado X, observado Y" — ela só é legível se os dois lados falarem a mesma
 * língua.
 */
import {
  formatMoneyValue,
  readBodyPaintIssue,
  readBodyPaintStatus,
  readMechanicalCondition,
  readTireCondition,
  type BodyPaintIssue,
  type BodyPaintStatus,
  type DeclaredCondition,
  type MechanicalCondition,
  type TireCondition,
} from "./api";

export {
  formatMoneyValue,
  readBodyPaintIssue,
  readBodyPaintStatus,
  readMechanicalCondition,
  readTireCondition,
};

/**
 * O estado do SUB-PROCESSO de agendamento.
 *
 * Não é o status da solicitação — é o passo dentro da avaliação. Enquanto for
 * `awaiting_slots` ou `awaiting_owner`, a solicitação continua em
 * `offer_selected`.
 */
export type InspectionState =
  | "awaiting_slots"
  | "awaiting_owner"
  | "scheduled"
  | "completed";

export type AdjustmentReason =
  | "mechanical"
  | "body_paint"
  | "tires"
  | "mileage_difference"
  | "documentation"
  | "other";

export const ADJUSTMENT_REASON_LABEL: Record<AdjustmentReason, string> = {
  mechanical: "Mecânica",
  body_paint: "Lataria e pintura",
  tires: "Pneus",
  mileage_difference: "Quilometragem diferente da informada",
  documentation: "Documentação",
  other: "Outro motivo",
};

export const ADJUSTMENT_REASON_OPTIONS: ReadonlyArray<{
  value: AdjustmentReason;
  label: string;
}> = (Object.keys(ADJUSTMENT_REASON_LABEL) as AdjustmentReason[]).map((value) => ({
  value,
  label: ADJUSTMENT_REASON_LABEL[value],
}));

/** De 1 a 3 horários por rodada. Espelha `INSPECTION_SLOTS`. */
export const INSPECTION_SLOTS = { MIN: 1, MAX: 3 } as const;

export const INSPECTION_LIMITS = {
  NOTES_MAX: 500,
  ADJUSTMENT_NOTE_MAX: 500,
} as const;

export type InspectionSlot = {
  id: number | string;
  /** ISO 8601 COM offset. A formatação em pt-BR é feita na tela. */
  starts_at: string;
};

/**
 * O que a loja OBSERVOU. As sete dimensões espelham exatamente o que a pessoa
 * declarou — é isso que torna a comparação possível.
 */
export type ObservedEvaluation = {
  mileage: number;
  condition: DeclaredCondition;
  tire_condition: TireCondition;
  engine_condition: MechanicalCondition;
  gearbox_condition: MechanicalCondition;
  suspension_condition: MechanicalCondition;
  body_paint_status: BodyPaintStatus;
  body_paint_issues: BodyPaintIssue[] | null;
  notes: string | null;
};

/**
 * O endereço COMERCIAL da loja, entregue ao proprietário depois da seleção.
 *
 * Existe por uma finalidade única: saber onde comparecer. NÃO há telefone,
 * e-mail, WhatsApp, CNPJ nem nome de operador — a API não os devolve, então não
 * há campo escondido para a tela esconder.
 *
 * `address` é um texto livre porque o schema real é um texto livre
 * (`advertisers.address`): tentar estruturá-lo por heurística erraria em
 * silêncio, e um endereço errado é pior que um endereço feio.
 */
export type StoreLocation = {
  name: string;
  address: string | null;
  /** "Atibaia - SP". `null` quando a loja não tem cidade resolvida. */
  city: string | null;
};

/** O bloco de avaliação como o PROPRIETÁRIO o recebe. */
export type OwnerInspection = {
  state: InspectionState;
  /** Só preenchido enquanto a escolha está com o proprietário. */
  slots: InspectionSlot[];
  scheduled_at: string | null;
  completed_at: string | null;
  store: StoreLocation | null;
  observed: ObservedEvaluation | null;
};

/** O bloco de avaliação como o LOJISTA o recebe. */
export type DealerInspection = {
  state: InspectionState;
  round: number;
  slots: InspectionSlot[];
  scheduled_at: string | null;
  completed_at: string | null;
  observed: ObservedEvaluation | null;
};

export type PostInspectionDecisionType = "final_offer" | "no_offer";

/**
 * A decisão da loja depois de ver o carro.
 *
 * `difference` vem CALCULADA do servidor — não é derivada na tela. Duas
 * interfaces calculando a mesma subtração acabariam divergindo no
 * arredondamento, e este é o número que a pessoa vai olhar para entender o que
 * aconteceu com o valor dela.
 *
 * Não existe `internal_note` neste tipo, e não pode passar a existir: a nota
 * operacional da loja é coluna separada no banco e nenhuma query do proprietário
 * a seleciona.
 */
export type PostInspectionDecision = {
  type: PostInspectionDecisionType;
  preliminary_amount: string;
  final_amount: string | null;
  /** Negativa quando o valor caiu. String decimal, como todo dinheiro daqui. */
  difference: string | null;
  reason: AdjustmentReason | null;
  note: string | null;
  created_at: string;
};

// ────────────────────────────────────────────────────────────────────────────
// DATA E HORA
// ────────────────────────────────────────────────────────────────────────────

/**
 * Instante ISO → "terça-feira, 25/08 às 14:30".
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEM `timeZone` FIXO — E ISSO É DELIBERADO
 * ────────────────────────────────────────────────────────────────────────────
 * `toLocaleString` sem `timeZone` formata no fuso de QUEM ESTÁ LENDO, que é
 * exatamente o certo aqui: o proprietário em Manaus e a loja em Atibaia veem o
 * MESMO instante, cada um no relógio da parede dele.
 *
 * Fixar `America/Sao_Paulo` seria a mesma adivinhação que o backend recusa a
 * fazer, só que no cliente — e erraria em toda cidade fora do fuso de Brasília.
 *
 * Isto difere do `formatFipeReference`, que usa `timeZone: "UTC"` de propósito:
 * lá o valor é uma REFERÊNCIA MENSAL cuja data cai na virada do mês, e o fuso
 * local a envelheceria em um mês. Aqui o valor é um COMPROMISSO — a hora em que
 * duas pessoas vão se encontrar — e ele tem de ser lido no fuso de cada uma.
 */
export function formatSlot(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return `${weekday}, ${day} às ${time}`;
}

/** Versão curta, para cabeçalhos: "25/08 às 14:30". */
export function formatSlotShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${day} às ${time}`;
}

/**
 * Valor de `<input type="datetime-local">` → ISO 8601 **COM offset**.
 *
 * O input entrega `2026-08-25T14:30` — sem fuso nenhum. Mandar isso ao servidor
 * seria mandar um texto ambíguo, e o backend recusa (com razão): ele não tem
 * como saber de que instante o navegador está falando.
 *
 * A conversão usa o offset do PRÓPRIO navegador, que é o único fuso que
 * conhecemos com certeza — é o relógio da pessoa que digitou. `new Date(valor)`
 * interpreta a string local como hora local, e daí extraímos o offset real
 * (inclusive horário de verão, se voltar a existir).
 *
 * Devolve `null` quando o valor é vazio ou inválido, para que a tela decida o
 * que fazer sem receber um `Invalid Date` disfarçado de string.
 */
export function localInputToIso(value: string): string | null {
  const text = String(value ?? "").trim();
  if (text === "") return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");

  // `getTimezoneOffset` devolve MINUTOS ATRÁS de UTC — invertido em relação ao
  // sinal do ISO. Brasília (UTC-3) devolve +180, e o offset escrito é "-03:00".
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offset = `${sign}${pad(offsetMinutes / 60)}:${pad(offsetMinutes % 60)}`;

  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());

  return `${y}-${mo}-${d}T${h}:${mi}:00${offset}`;
}

/** O menor valor aceitável num `datetime-local`: agora, no fuso do navegador. */
export function nowForInput(): string {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

// ────────────────────────────────────────────────────────────────────────────
// APRESENTAÇÃO
// ────────────────────────────────────────────────────────────────────────────

/** "62.000 km". */
export function formatKm(value: number): string {
  return `${Number(value || 0).toLocaleString("pt-BR")} km`;
}

/**
 * A diferença entre a proposta preliminar e a final, formatada COM SINAL.
 *
 * O sinal é o dado mais importante da linha: "- R$ 5.000" e "+ R$ 5.000" contam
 * histórias opostas, e um valor absoluto obrigaria a pessoa a comparar os dois
 * números de cabeça para descobrir qual delas aconteceu.
 */
export function formatDifference(value: string | null): string | null {
  if (value == null || value === "") return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return null;

  const money = formatMoneyValue(Math.abs(numeric).toFixed(2));
  if (!money) return null;

  return `${numeric < 0 ? "−" : "+"} ${money}`;
}

/** O endereço completo da loja numa linha, para exibição. */
export function formatStoreLocation(store: StoreLocation | null): string | null {
  if (!store) return null;
  const parts = [store.address, store.city].filter(
    (part): part is string => typeof part === "string" && part.trim() !== ""
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}
