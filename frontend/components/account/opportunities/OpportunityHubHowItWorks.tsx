/**
 * "Como funciona" — os dois fluxos, lado a lado com o caminho que descrevem.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * OS PASSOS DESCREVEM O QUE O SISTEMA FAZ HOJE
 * ════════════════════════════════════════════════════════════════════════════
 * Cada um dos seis passos corresponde a uma tela ou ação que EXISTE:
 *
 *   compradores → ver a procura, enviar veículo do estoque, acompanhar;
 *   veículos    → analisar a ficha, ofertar, negociar depois do aceite.
 *
 * Nenhum passo promete etapa futura. Um fluxo que descrevesse "contrato
 * digital" ou "pagamento pela plataforma" venderia um produto que ninguém
 * construiu, e a primeira pessoa a cobrar seria justamente quem leu isto aqui.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AS SETAS SÃO DECORATIVAS, A ORDEM NÃO
 * ════════════════════════════════════════════════════════════════════════════
 * A sequência é comunicada pelo NÚMERO em cada passo, que é texto de verdade.
 * As setas somem no celular (onde os passos empilham e apontariam para o lado
 * errado) e são `aria-hidden` em toda largura — quem usa leitor de tela recebe
 * "1", "2", "3" na ordem do DOM, que é a ordem real.
 */

export type HowItWorksStep = {
  title: string;
  description: string;
};

export type HowItWorksFlow = {
  /** O caminho a que os passos pertencem — é o rótulo da faixa. */
  label: string;
  tone: "blue" | "teal";
  icon: React.ReactNode;
  steps: readonly HowItWorksStep[];
};

const TONE = {
  blue: {
    row: "border-[#E4EDFB] bg-[#F8FBFF]",
    badge: "bg-[#EAF2FF] text-[#0e62d8]",
    step: "bg-[#EAF2FF] text-[#0e62d8]",
  },
  teal: {
    row: "border-[#D8F0E9] bg-[#F6FCFA]",
    badge: "bg-[#E3F7F1] text-[#0E9384]",
    step: "bg-[#E3F7F1] text-[#0E9384]",
  },
} as const;

function Arrow() {
  return (
    <span
      className="hidden shrink-0 text-[#C3CDDE] lg:block"
      aria-hidden="true"
      data-testid="dealer-hub-step-arrow"
    >
      <svg viewBox="0 0 32 12" className="h-3 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M0 6h28M24 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Flow({ flow }: { flow: HowItWorksFlow }) {
  const style = TONE[flow.tone];

  return (
    <li
      className={`rounded-2xl border p-4 sm:p-5 ${style.row}`}
      data-testid="dealer-hub-how-flow"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-5">
        {/* O rótulo do caminho: mesma cor e mesmo ícone do cartão lá de cima. */}
        <div className="flex shrink-0 items-center gap-2.5 lg:w-[188px]">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.badge}`}
            aria-hidden="true"
          >
            {flow.icon}
          </span>
          <p className="text-[13.5px] font-bold leading-tight text-[#161f34]">{flow.label}</p>
        </div>

        <ol className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
          {flow.steps.map((step, index) => (
            <li
              key={step.title}
              className="flex min-w-0 flex-1 items-start gap-2.5 lg:contents"
            >
              {/*
                `lg:contents` dissolve o `<li>` no desktop para que a seta possa
                ficar ENTRE os passos como irmã deles — dentro do `<li>` ela
                apareceria depois do último também, ou exigiria um segundo
                elemento fora da lista.
              */}
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold ${style.step}`}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-bold leading-tight text-[#1D2440]">
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-[#667085]">
                    {step.description}
                  </p>
                </div>
              </div>
              {index < flow.steps.length - 1 ? <Arrow /> : null}
            </li>
          ))}
        </ol>
      </div>
    </li>
  );
}

export default function OpportunityHubHowItWorks({
  flows,
}: {
  flows: readonly HowItWorksFlow[];
}) {
  return (
    <section
      id="como-funciona"
      className="scroll-mt-24 rounded-2xl border border-[#E8ECF4] bg-white p-4 sm:p-6"
      data-testid="dealer-hub-how-it-works"
    >
      <h2 className="text-[17px] font-bold leading-tight text-[#161f34] sm:text-[19px]">
        Como funciona
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[#667085]">
        Entenda os passos de cada oportunidade e gere mais negócios.
      </p>

      <ul className="mt-4 space-y-3.5">
        {flows.map((flow) => (
          <Flow key={flow.label} flow={flow} />
        ))}
      </ul>
    </section>
  );
}
