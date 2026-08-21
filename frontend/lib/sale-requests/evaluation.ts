// Completude da ficha de avaliação — FONTE ÚNICA.
//
// ────────────────────────────────────────────────────────────────────────────
// POR QUE ESTE ARQUIVO EXISTE
// ────────────────────────────────────────────────────────────────────────────
// A versão anterior do formulário decidia se podia enviar com UMA expressão
// booleana de doze termos (`canSubmit`), lida em um lugar só: o `disabled` do
// botão. Isso produzia dois defeitos, e os dois foram observados em uso real.
//
//   1. O BOTÃO CINZA MUDO. Quando qualquer termo era falso, a pessoa via um
//      botão desabilitado e nada mais. Nenhum campo destacado, nenhuma mensagem,
//      nenhuma pista de qual dos doze termos faltava. O caso reproduzido: o
//      campo de cidade guarda o texto DIGITADO no input mesmo quando nenhuma
//      cidade foi escolhida da lista, então a tela mostrava "Curitiba" e o
//      estado interno era `null`. Formulário visualmente completo, botão cinza,
//      zero explicação.
//
//   2. O TERMO QUE NÃO VALIDAVA NADA. `Number.isFinite(mileageNumber) &&
//      mileageNumber >= 0` era o teste de quilometragem, e `Number("")` é `0`.
//      Campo vazio passava. O gate liberava o envio e o backend recusava com
//      400 — o pior dos dois mundos, porque a tela tinha um teste de km e ele
//      não testava nada.
//
// Um booleano agregado não tem como não ter esses defeitos: ele destrói a
// informação de QUAL condição falhou no exato momento em que a calcula.
//
// A estrutura abaixo devolve o mesmo veredito e mais a razão dele. Ela alimenta,
// sem duplicação: o CTA, os erros por seção, a barra de progresso, o checklist
// do resumo lateral, o cartão "pronto para análise" e os testes.
//
// FUNÇÃO PURA, sem React: é o que permite testar as regras sem montar a tela.

import {
  SALE_REQUEST_LIMITS,
  SALE_REQUEST_PHOTOS,
  moneyToDecimal,
  type BodyPaintIssue,
  type BodyPaintStatus,
  type CautionReportResult,
  type CautionReportStatus,
  type CreateSaleRequestInput,
  type DeclaredCondition,
  type IpvaStatus,
  type LicensingStatus,
  type MechanicalCondition,
  type TireCondition,
  type YesNoUnknown,
} from "@/lib/sale-requests/api";

/**
 * As NOVE seções ESSENCIAIS, na ordem em que a ficha as apresenta.
 *
 * `price` (o valor mínimo, Fase 4.3.3) entrou por último e fica por último: é a
 * única declaração ECONÔMICA da ficha, e quem acabou de descrever pneus, laudo,
 * leilão e mecânica decide melhor o próprio piso do que quem ainda não olhou
 * para nada disso.
 */
export const SECTION_KEYS = [
  "vehicle",
  "condition",
  "tires",
  "financial",
  "history",
  "mechanics",
  "bodyPaint",
  "photos",
  "price",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABEL: Record<SectionKey, string> = {
  vehicle: "Dados do veículo",
  condition: "Estado geral",
  tires: "Pneus",
  financial: "Pendências e documentação",
  history: "Histórico do veículo",
  mechanics: "Mecânica",
  bodyPaint: "Lataria e pintura",
  photos: "Fotos do veículo",
  price: "Valor mínimo",
};

/**
 * Estado do formulário.
 *
 * `""` é o estado NÃO RESPONDIDO de cada escolha, e é por isso que os tipos são
 * `Union | ""` em vez de `Union | null`: "não respondeu" precisa ser diferente
 * de `unknown` ("respondeu que não sabe"), que é um valor legítimo e completa a
 * seção. Se os dois fossem o mesmo, a ficha ficaria completa sozinha.
 *
 * Os valores monetários guardam DÍGITOS (centavos), não texto formatado — ver
 * `moneyDigits` em `api.ts`.
 */
export type SaleRequestFormState = {
  // Seção 1 — dados do veículo. `brandName`/`modelName`/`year` chegam já
  // RESOLVIDOS da cadeia FIPE: são o rótulo que o servidor vai receber, e não o
  // código do select.
  brandName: string;
  modelName: string;
  year: string;
  mileage: string;
  transmission: string;
  fuelType: string;
  cityId: number | null;

  // Seção 2
  condition: DeclaredCondition | "";

  // Seção 3
  tireCondition: TireCondition | "";

  // Seção 4
  financingStatus: YesNoUnknown | "";
  financingBalance: string;
  finesStatus: YesNoUnknown | "";
  finesAmount: string;
  ipvaStatus: IpvaStatus | "";
  ipvaAmountDue: string;
  licensingStatus: LicensingStatus | "";

  // Seção 5 — o laudo é DUAS perguntas na tela e UMA coluna no banco.
  cautionReportHas: YesNoUnknown | "";
  cautionReportResult: CautionReportResult | "";
  auctionHistory: YesNoUnknown | "";
  collisionHistory: YesNoUnknown | "";

  // Seção 6
  engineCondition: MechanicalCondition | "";
  engineNotes: string;
  gearboxCondition: MechanicalCondition | "";
  gearboxNotes: string;
  suspensionCondition: MechanicalCondition | "";
  suspensionNotes: string;

  // Seção 7
  bodyPaintStatus: BodyPaintStatus | "";
  bodyPaintIssues: BodyPaintIssue[];
  bodyPaintNotes: string;

  // Seção 8
  photoCount: number;

  // Seção 9 — o PISO. Dígitos (centavos), como todo dinheiro deste formulário.
  minimumPrice: string;

  // Seção 10 — OPCIONAL, e por isso fora da contagem de completude.
  notes: string;
};

/** Estado inicial. Tudo vazio: nada é pré-respondido em nome da pessoa. */
export const EMPTY_FORM_STATE: SaleRequestFormState = {
  brandName: "",
  modelName: "",
  year: "",
  mileage: "",
  transmission: "",
  fuelType: "",
  cityId: null,

  condition: "",
  tireCondition: "",

  financingStatus: "",
  financingBalance: "",
  finesStatus: "",
  finesAmount: "",
  ipvaStatus: "",
  ipvaAmountDue: "",
  licensingStatus: "",

  cautionReportHas: "",
  cautionReportResult: "",
  auctionHistory: "",
  collisionHistory: "",

  engineCondition: "",
  engineNotes: "",
  gearboxCondition: "",
  gearboxNotes: "",
  suspensionCondition: "",
  suspensionNotes: "",

  bodyPaintStatus: "",
  bodyPaintIssues: [],
  bodyPaintNotes: "",

  photoCount: 0,
  minimumPrice: "",
  notes: "",
};

/**
 * Os campos que NÃO são digitados nesta ficha — vêm de outra fonte.
 *
 * `brandName`/`modelName`/`year` saem da cadeia FIPE, `cityId` do componente de
 * cidade e `photoCount` da galeria. Nenhum deles é guardado em `useState` pelo
 * formulário: são derivados a cada render das suas fontes reais, e duplicá-los
 * em estado próprio criaria a chance de a cópia ficar velha — que é exatamente
 * a classe de defeito que esta ficha existe para eliminar.
 */
export type DerivedFields = Pick<
  SaleRequestFormState,
  "brandName" | "modelName" | "year" | "cityId" | "photoCount"
>;

/** O que a pessoa RESPONDE. É o único objeto que o formulário guarda em estado. */
export type SaleRequestAnswers = Omit<SaleRequestFormState, keyof DerivedFields>;

export const EMPTY_ANSWERS: SaleRequestAnswers = {
  mileage: "",
  transmission: "",
  fuelType: "",

  condition: "",
  tireCondition: "",

  financingStatus: "",
  financingBalance: "",
  finesStatus: "",
  finesAmount: "",
  ipvaStatus: "",
  ipvaAmountDue: "",
  licensingStatus: "",

  cautionReportHas: "",
  cautionReportResult: "",
  auctionHistory: "",
  collisionHistory: "",

  engineCondition: "",
  engineNotes: "",
  gearboxCondition: "",
  gearboxNotes: "",
  suspensionCondition: "",
  suspensionNotes: "",

  bodyPaintStatus: "",
  bodyPaintIssues: [],
  bodyPaintNotes: "",

  minimumPrice: "",

  notes: "",
};

/** Um requisito não atendido. `field` é a chave DOM; `label` é o que a pessoa lê. */
export type MissingItem = {
  section: SectionKey;
  field: string;
  label: string;
  message: string;
};

export type SectionState = {
  key: SectionKey;
  label: string;
  complete: boolean;
  missing: MissingItem[];
};

export type ValidationState = {
  sections: SectionState[];
  /** Achatado, na ORDEM da ficha — o primeiro é o que recebe foco. */
  missing: MissingItem[];
  missingSections: SectionState[];
  completedSections: number;
  totalSections: number;
  /** 0–100, arredondado. Derivado de seções, não de campos. */
  progress: number;
  isComplete: boolean;
};

/** `id` do elemento que recebe foco quando o requisito está faltando. */
export function fieldDomId(field: string): string {
  return `sr-field-${field}`;
}

/** `id` do bloco de erro de um campo, para o `aria-describedby`. */
export function fieldErrorDomId(field: string): string {
  return `sr-error-${field}`;
}

/**
 * Quilometragem: STRING de dígitos, não número.
 *
 * O teste é sobre o TEXTO ter conteúdo, e só depois sobre o número caber na
 * faixa. É a correção direta do defeito descrito no topo: um campo vazio não
 * pode virar `0` e passar por "quilometragem informada". Carro 0 km existe e
 * continua válido — a pessoa digita `0`, e aí a string não está vazia.
 */
function mileageIsValid(raw: string): boolean {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits === "") return false;
  const value = Number(digits);
  return Number.isSafeInteger(value) && value >= 0 && value <= SALE_REQUEST_LIMITS.MILEAGE_MAX;
}

/**
 * O PISO digitado é válido?
 *
 * Guarda DÍGITOS (centavos), como todo dinheiro deste formulário. Vazio não
 * vale, e zero não vale: como piso, zero seria "aceito qualquer proposta"
 * escrito com aparência de valor declarado. É a mesma regra que
 * `validateMinimumAcceptedPrice` aplica no servidor — aqui ela existe para dar
 * mensagem de campo antes do POST, não para substituir aquela.
 */
function minimumPriceIsValid(raw: string): boolean {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits === "") return false;
  return Number(digits) > 0;
}

/**
 * Estado do laudo: duas perguntas da tela → um valor de coluna.
 *
 * `null` quando ainda não dá para decidir — ou a primeira pergunta está sem
 * resposta, ou ela é "sim" e o resultado ainda não foi escolhido. Não existe
 * caminho que produza "não possui laudo" junto de um resultado: o resultado só é
 * lido no ramo `yes`.
 */
export function resolveCautionReportStatus(
  has: YesNoUnknown | "",
  result: CautionReportResult | ""
): CautionReportStatus | null {
  if (has === "no") return "not_available";
  if (has === "unknown") return "unknown";
  if (has === "yes") return result === "" ? null : result;
  return null;
}

/** Acrescenta um item faltante quando a condição NÃO foi satisfeita. */
function require_(
  target: MissingItem[],
  ok: boolean,
  item: Omit<MissingItem, "section">,
  section: SectionKey
) {
  if (!ok) target.push({ ...item, section });
}

/**
 * O estado do formulário → completude estruturada.
 *
 * A ordem em que os requisitos são acrescentados É a ordem visual da ficha, e
 * isso importa: `missing[0]` é o campo que recebe foco quando a pessoa tenta
 * enviar, e mandar o foco para o meio da tela quando o que falta está no topo
 * confundiria mais do que ajudaria.
 */
export function buildValidationState(state: SaleRequestFormState): ValidationState {
  const sections: SectionState[] = [];

  const push = (key: SectionKey, missing: MissingItem[]) => {
    sections.push({
      key,
      label: SECTION_LABEL[key],
      complete: missing.length === 0,
      missing,
    });
  };

  // ── 1. Dados do veículo ───────────────────────────────────────────────────
  const vehicle: MissingItem[] = [];
  require_(vehicle, Boolean(state.brandName), {
    field: "brand",
    label: "Marca",
    message: "Escolha a marca do veículo.",
  }, "vehicle");
  require_(vehicle, Boolean(state.modelName), {
    field: "model",
    label: "Modelo e versão",
    message: "Escolha o modelo do veículo.",
  }, "vehicle");
  require_(vehicle, Boolean(state.year), {
    field: "year",
    label: "Ano",
    message: "Escolha o ano do veículo.",
  }, "vehicle");
  require_(vehicle, mileageIsValid(state.mileage), {
    field: "mileage",
    label: "Quilometragem",
    message: "Informe a quilometragem do veículo.",
  }, "vehicle");
  require_(vehicle, Boolean(state.transmission), {
    field: "transmission",
    label: "Câmbio",
    message: "Escolha o câmbio.",
  }, "vehicle");
  require_(vehicle, Boolean(state.fuelType), {
    field: "fuel_type",
    label: "Combustível",
    message: "Escolha o combustível.",
  }, "vehicle");
  // A cidade só conta quando veio da LISTA, com id real do catálogo. Texto
  // digitado no campo não é cidade — foi exatamente essa diferença que produziu
  // o botão cinza sem explicação.
  require_(vehicle, state.cityId != null, {
    field: "city",
    label: "Cidade",
    message: "Escolha a cidade na lista para confirmá-la.",
  }, "vehicle");
  push("vehicle", vehicle);

  // ── 2. Estado geral ───────────────────────────────────────────────────────
  const condition: MissingItem[] = [];
  require_(condition, Boolean(state.condition), {
    field: "declared_condition",
    label: "Estado geral",
    message: "Escolha o estado geral do veículo.",
  }, "condition");
  push("condition", condition);

  // ── 3. Pneus ──────────────────────────────────────────────────────────────
  const tires: MissingItem[] = [];
  require_(tires, Boolean(state.tireCondition), {
    field: "tire_condition",
    label: "Pneus",
    message: "Informe como estão os pneus.",
  }, "tires");
  push("tires", tires);

  // ── 4. Pendências e documentação ──────────────────────────────────────────
  // Os valores em dinheiro são OPCIONAIS em todos os ramos: quem tem
  // financiamento e não sabe o saldo de cabeça não pode ficar impedido de
  // publicar por causa disso.
  const financial: MissingItem[] = [];
  require_(financial, Boolean(state.financingStatus), {
    field: "financing_status",
    label: "Financiamento",
    message: "Informe se o veículo possui financiamento ativo.",
  }, "financial");
  require_(financial, Boolean(state.finesStatus), {
    field: "fines_status",
    label: "Multas pendentes",
    message: "Informe se há multas pendentes.",
  }, "financial");
  require_(financial, Boolean(state.ipvaStatus), {
    field: "ipva_status",
    label: "Situação do IPVA",
    message: "Informe a situação do IPVA.",
  }, "financial");
  require_(financial, Boolean(state.licensingStatus), {
    field: "licensing_status",
    label: "Licenciamento",
    message: "Informe a situação do licenciamento.",
  }, "financial");
  push("financial", financial);

  // ── 5. Histórico ──────────────────────────────────────────────────────────
  const history: MissingItem[] = [];
  require_(history, Boolean(state.cautionReportHas), {
    field: "caution_report_has",
    label: "Laudo cautelar",
    message: "Informe se o veículo possui laudo cautelar.",
  }, "history");
  // O resultado só é exigido no ramo em que ele existe.
  require_(history, state.cautionReportHas !== "yes" || Boolean(state.cautionReportResult), {
    field: "caution_report_result",
    label: "Resultado do laudo",
    message: "Informe o resultado do laudo cautelar.",
  }, "history");
  require_(history, Boolean(state.auctionHistory), {
    field: "auction_history",
    label: "Passagem por leilão",
    message: "Informe se o veículo passou por leilão.",
  }, "history");
  require_(history, Boolean(state.collisionHistory), {
    field: "collision_history",
    label: "Colisão ou sinistro",
    message: "Informe se há colisão ou sinistro conhecido.",
  }, "history");
  push("history", history);

  // ── 6. Mecânica ───────────────────────────────────────────────────────────
  const mechanics: MissingItem[] = [];
  const parts = [
    {
      condition: state.engineCondition,
      notes: state.engineNotes,
      field: "engine_condition",
      notesField: "engine_notes",
      label: "Motor",
    },
    {
      condition: state.gearboxCondition,
      notes: state.gearboxNotes,
      field: "gearbox_condition",
      notesField: "gearbox_notes",
      label: "Câmbio",
    },
    {
      condition: state.suspensionCondition,
      notes: state.suspensionNotes,
      field: "suspension_condition",
      notesField: "suspension_notes",
      label: "Suspensão",
    },
  ];

  for (const part of parts) {
    require_(mechanics, Boolean(part.condition), {
      field: part.field,
      label: part.label,
      message: `Informe a situação do item ${part.label.toLowerCase()}.`,
    }, "mechanics");
    // "Possui problema" sem descrição não ajuda ninguém a avaliar nada — mesma
    // regra que o backend impõe, escrita aqui para dar a mensagem imediata.
    require_(
      mechanics,
      part.condition !== "issue" || part.notes.trim().length > 0,
      {
        field: part.notesField,
        label: `Descrição do problema (${part.label.toLowerCase()})`,
        message: `Descreva o problema do item ${part.label.toLowerCase()}.`,
      },
      "mechanics"
    );
  }
  push("mechanics", mechanics);

  // ── 7. Lataria e pintura ──────────────────────────────────────────────────
  const bodyPaint: MissingItem[] = [];
  require_(bodyPaint, Boolean(state.bodyPaintStatus), {
    field: "body_paint_status",
    label: "Lataria e pintura",
    message: "Informe se há detalhes conhecidos na lataria ou pintura.",
  }, "bodyPaint");
  require_(
    bodyPaint,
    state.bodyPaintStatus !== "issues" || state.bodyPaintIssues.length > 0,
    {
      field: "body_paint_issues",
      label: "Detalhes da lataria",
      message: "Marque pelo menos um detalhe da lataria ou pintura.",
    },
    "bodyPaint"
  );
  push("bodyPaint", bodyPaint);

  // ── 8. Fotos ──────────────────────────────────────────────────────────────
  const photos: MissingItem[] = [];
  require_(
    photos,
    state.photoCount >= SALE_REQUEST_PHOTOS.MIN && state.photoCount <= SALE_REQUEST_PHOTOS.MAX,
    {
      field: "photos",
      label: "Fotos do veículo",
      message:
        state.photoCount > SALE_REQUEST_PHOTOS.MAX
          ? `Envie no máximo ${SALE_REQUEST_PHOTOS.MAX} fotos.`
          : `Envie pelo menos ${SALE_REQUEST_PHOTOS.MIN} fotos do veículo.`,
    },
    "photos"
  );
  push("photos", photos);

  // ── 9. Valor mínimo ───────────────────────────────────────────────────────
  //
  // O PISO é obrigatório, e a validação é a MESMA do servidor: precisa existir e
  // ser maior que zero. Não há checagem contra a FIPE aqui — os 15% recomendados
  // são orientação, e transformá-los em bloqueio de formulário impediria uma
  // publicação que a API aceita.
  //
  // "0" digitado NÃO completa a seção. Zero é um número válido para saldo
  // devedor ("devo zero"), mas como piso significaria "aceito qualquer
  // proposta" — e ninguém declara isso digitando um valor mínimo.
  const price: MissingItem[] = [];
  require_(price, minimumPriceIsValid(state.minimumPrice), {
    field: "minimum_price",
    label: "Valor mínimo",
    message: "Informe o valor mínimo que você aceita pelo veículo.",
  }, "price");
  push("price", price);

  // Observações adicionais NÃO entram: são opcionais, e contá-las faria a ficha
  // parar em 8/9 para quem não tem nada a acrescentar.
  const missing = sections.flatMap((section) => section.missing);
  const completedSections = sections.filter((section) => section.complete).length;

  return {
    sections,
    missing,
    missingSections: sections.filter((section) => !section.complete),
    completedSections,
    totalSections: sections.length,
    progress: Math.round((completedSections / sections.length) * 100),
    isComplete: missing.length === 0,
  };
}

/**
 * Mensagem do erro de envio — nomeia o que falta.
 *
 * "Preencha todos os campos" é o que a tela dizia antes de existir esta função,
 * e não diz nada: quem já acha que preencheu tudo continua sem saber onde
 * procurar. Aqui os itens são nomeados, na ordem da ficha.
 *
 * O corte em `MAX_NAMED` evita a lista de quinze itens que ninguém lê no
 * formulário recém-aberto — e o "e mais N" mantém a contagem honesta.
 */
const MAX_NAMED = 4;

export function buildMissingMessage(missing: MissingItem[]): string {
  if (missing.length === 0) return "";

  const labels = missing.slice(0, MAX_NAMED).map((item) => item.label);
  const rest = missing.length - labels.length;

  let list: string;
  if (labels.length === 1) {
    list = labels[0];
  } else {
    list = `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
  }
  if (rest > 0) list += `, e mais ${rest}`;

  const count = missing.length;
  const noun = count === 1 ? "informação" : "informações";
  return `Revise ${count} ${noun} antes de enviar: ${list}.`;
}

/**
 * Estado do formulário → corpo do POST.
 *
 * A NORMALIZAÇÃO CONDICIONAL acontece aqui também, e não só no servidor: um
 * saldo devedor digitado e depois abandonado (a pessoa mudou "sim" para "não")
 * não deve nem sair da tela. O servidor descarta de qualquer jeito — este é o
 * cinto, aquele é o suspensório.
 *
 * Lança se chamada com a ficha incompleta. Não é defensividade decorativa: o
 * tipo `CreateSaleRequestInput` exige valores não vazios, e a alternativa seria
 * um `as` que apagaria a garantia justamente onde ela vale.
 */
export function toCreatePayload(
  state: SaleRequestFormState,
  extras: {
    photoKeys: string[];
    fipeBrandCode: string;
    fipeModelCode: string;
    fipeYearCode: string;
  }
): CreateSaleRequestInput {
  const cautionReportStatus = resolveCautionReportStatus(
    state.cautionReportHas,
    state.cautionReportResult
  );

  const minimumAcceptedPrice = moneyToDecimal(state.minimumPrice);

  if (
    minimumAcceptedPrice == null ||
    Number(minimumAcceptedPrice) <= 0 ||
    state.cityId == null ||
    !state.condition ||
    !state.tireCondition ||
    !state.financingStatus ||
    !state.finesStatus ||
    !state.ipvaStatus ||
    !state.licensingStatus ||
    cautionReportStatus == null ||
    !state.auctionHistory ||
    !state.collisionHistory ||
    !state.engineCondition ||
    !state.gearboxCondition ||
    !state.suspensionCondition ||
    !state.bodyPaintStatus
  ) {
    throw new Error("Ficha incompleta: o payload só é montado com a ficha completa.");
  }

  const hasIssues = state.bodyPaintStatus === "issues";

  return {
    city_id: state.cityId,
    brand: state.brandName,
    fipe_model_description: state.modelName,
    year: state.year,
    mileage: String(state.mileage).replace(/\D/g, ""),
    transmission: state.transmission,
    fuel_type: state.fuelType,
    declared_condition: state.condition,
    known_issues: state.notes.trim() ? state.notes.trim() : null,

    tire_condition: state.tireCondition,

    financing_status: state.financingStatus,
    financing_balance:
      state.financingStatus === "yes" ? moneyToDecimal(state.financingBalance) : null,
    fines_status: state.finesStatus,
    fines_amount: state.finesStatus === "yes" ? moneyToDecimal(state.finesAmount) : null,
    ipva_status: state.ipvaStatus,
    ipva_amount_due:
      state.ipvaStatus === "installments" || state.ipvaStatus === "open"
        ? moneyToDecimal(state.ipvaAmountDue)
        : null,
    licensing_status: state.licensingStatus,

    caution_report_status: cautionReportStatus,
    auction_history: state.auctionHistory,
    collision_history: state.collisionHistory,

    engine_condition: state.engineCondition,
    engine_notes: state.engineCondition === "issue" ? state.engineNotes.trim() : null,
    gearbox_condition: state.gearboxCondition,
    gearbox_notes: state.gearboxCondition === "issue" ? state.gearboxNotes.trim() : null,
    suspension_condition: state.suspensionCondition,
    suspension_notes: state.suspensionCondition === "issue" ? state.suspensionNotes.trim() : null,

    body_paint_status: state.bodyPaintStatus,
    body_paint_issues: hasIssues ? state.bodyPaintIssues : [],
    body_paint_notes: hasIssues && state.bodyPaintNotes.trim() ? state.bodyPaintNotes.trim() : null,

    images: extras.photoKeys,

    // O PISO. Vai como decimal ("62500.00"), igual aos outros valores
    // monetários; a faixa recomendada (FIPE − 15%) NÃO viaja: ela é orientação
    // de tela, e o servidor não a valida nem a guarda.
    minimum_accepted_price: minimumAcceptedPrice,

    fipe_brand_code: extras.fipeBrandCode,
    fipe_model_code: extras.fipeModelCode,
    fipe_year_code: extras.fipeYearCode,
  };
}
