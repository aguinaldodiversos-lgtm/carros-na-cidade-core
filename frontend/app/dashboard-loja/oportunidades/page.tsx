import type { Metadata } from "next";
import { requireLojistaDashboardSession } from "@/lib/account/dashboard-session";
import OpportunityHubMetrics from "@/components/account/opportunities/OpportunityHubMetrics";
import OpportunityHubChoiceCard from "@/components/account/opportunities/OpportunityHubChoiceCard";
import OpportunityHubHowItWorks, {
  type HowItWorksFlow,
} from "@/components/account/opportunities/OpportunityHubHowItWorks";
import { BuyersArt, VehiclesArt } from "@/components/account/opportunities/OpportunityHubArt";

export const metadata: Metadata = {
  title: "Oportunidades",
  description: "Oportunidades de negócio para a sua loja.",
  alternates: { canonical: "/dashboard-loja/oportunidades" },
};

export const dynamic = "force-dynamic";

/**
 * Hub de oportunidades da loja.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A TELA RESPONDE UMA PERGUNTA, E ELA TEM DUAS RESPOSTAS
 * ════════════════════════════════════════════════════════════════════════════
 * "Como eu gero negócio hoje?"
 *
 *   VENDER  o que já tenho  → Compradores ativos
 *   COMPRAR para repor      → Veículos para avaliação
 *
 * Os dois caminhos existem desde a Fase 4.3, mas a tela anterior os apresentava
 * como dois retângulos brancos com um botão azul cada — visualmente idênticos,
 * o que obrigava a LER os dois para descobrir que faziam coisas opostas. Aqui a
 * distinção é dada antes da leitura: cor, ilustração e verbo diferentes de cada
 * lado.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A SIDEBAR CONTINUA
 * ════════════════════════════════════════════════════════════════════════════
 * Ao contrário do DETALHE de um veículo (Fase 4.11A), que entra em modo foco,
 * este hub é uma tela de NAVEGAÇÃO — tirar o menu dela deixaria o lojista sem
 * saída. `lib/account/focus-routes.ts` distingue as duas por caminho, e há teste
 * para essa fronteira exata.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * OS NÚMEROS DO TOPO SÃO CONTADOS, NÃO ILUSTRATIVOS
 * ════════════════════════════════════════════════════════════════════════════
 * Os quatro cartões vêm de `/api/account/opportunities/summary`, que faz
 * `COUNT(*)` sobre as mesmas partições das listas que eles resumem. A variação
 * de 7 dias sai de `created_at`. Nenhum número é estimado, e quando não há base
 * de comparação a etiqueta verde dá lugar a uma frase neutra — ver
 * `dealer-opportunities-summary.service.js`.
 *
 * Continua valendo a regra do hub desde a Fase 2: um card por produto que
 * EXISTE, e nada de card desabilitado anunciando o que ainda não foi construído.
 */

const BUYERS_BENEFITS = [
  "Receba demandas reais da sua região",
  "Ofereça veículos do seu estoque",
  "Aumente suas chances de venda",
] as const;

const VEHICLES_BENEFITS = [
  "Encontre oportunidades para repor estoque",
  "Compare informações do veículo com segurança",
  "Envie ofertas diretamente pela plataforma",
] as const;

const FLOW_ICON = {
  buyers: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.4a3.4 3.4 0 0 1 0 6.6M17.5 13.4c2 .8 3.5 2.8 3.5 5.1" />
    </svg>
  ),
  vehicles: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 16v2.2M20 16v2.2M3 15.5c0-1.6.9-2.6 2.4-3l1.9-4c.4-.9 1.2-1.4 2.2-1.4h5c1 0 1.8.5 2.2 1.4l1.9 4c1.5.4 2.4 1.4 2.4 3v.5H3v-.5Z" />
      <circle cx="7.4" cy="15.8" r="1.1" />
      <circle cx="16.6" cy="15.8" r="1.1" />
    </svg>
  ),
} as const;

const FLOWS: readonly HowItWorksFlow[] = [
  {
    label: "Compradores ativos",
    tone: "blue",
    icon: FLOW_ICON.buyers,
    steps: [
      {
        title: "Ver intenção de compra",
        description: "Confira perfis de pessoas procurando veículos.",
      },
      {
        title: "Ofertar veículo do estoque",
        description: "Envie ofertas com veículos da sua loja.",
      },
      {
        title: "Aguardar resposta",
        description: "Acompanhe o interesse e continue a conversa.",
      },
    ],
  },
  {
    label: "Veículos para avaliação",
    tone: "teal",
    icon: FLOW_ICON.vehicles,
    steps: [
      {
        title: "Analisar veículo",
        description: "Veja detalhes e histórico enviado pelo proprietário.",
      },
      {
        title: "Enviar oferta",
        description: "Faça sua proposta de compra de forma segura.",
      },
      {
        title: "Negociar compra",
        description: "Converse e feche a compra para repor seu estoque.",
      },
    ],
  },
];

export default async function OportunidadesHubPage() {
  await requireLojistaDashboardSession();

  return (
    <section data-testid="dealer-opportunities-hub">
      <header className="mb-5">
        <h1 className="text-[24px] font-bold leading-tight tracking-[-0.01em] text-[#161f34] sm:text-[30px]">
          Oportunidades
        </h1>
        <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-[#667085]">
          Escolha como deseja gerar negócios: vender para compradores ativos ou comprar
          veículos para repor seu estoque.
        </p>
      </header>

      <OpportunityHubMetrics />

      {/*
        Os dois caminhos, lado a lado a partir de `lg`. Abaixo disso empilham na
        ordem do DOM — compradores primeiro, que é o produto mais antigo e o que
        a maior parte das lojas usa.
      */}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <OpportunityHubChoiceCard
          tone="blue"
          art={<BuyersArt className="w-full" />}
          title="Compradores ativos"
          description="Veja pessoas que procuram veículos e envie ofertas do seu estoque."
          benefits={BUYERS_BENEFITS}
          ctaLabel="Ver compradores ativos"
          ctaHref="/dashboard-loja/oportunidades/compradores"
          howItWorksHref="#como-funciona"
          testId="dealer-hub-card-buyers"
          ctaTestId="dealer-opportunities-buyers-link"
        />

        <OpportunityHubChoiceCard
          tone="teal"
          art={<VehiclesArt className="w-full" />}
          title="Veículos para avaliação"
          description="Analise veículos enviados por proprietários e faça ofertas para compra."
          benefits={VEHICLES_BENEFITS}
          ctaLabel="Ver veículos para avaliação"
          ctaHref="/dashboard-loja/oportunidades/veiculos"
          howItWorksHref="#como-funciona"
          testId="dealer-hub-card-vehicles"
          ctaTestId="dealer-opportunities-vehicles-link"
        />
      </div>

      <OpportunityHubHowItWorks flows={FLOWS} />
    </section>
  );
}
