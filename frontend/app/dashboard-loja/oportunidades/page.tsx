import type { Metadata } from "next";
import { requireLojistaDashboardSession } from "@/lib/account/dashboard-session";
import OpportunityHubMetrics from "@/components/account/opportunities/OpportunityHubMetrics";
import DealerOpportunityAccess from "@/components/account/opportunities/DealerOpportunityAccess";
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
 * Hub comercial: primeiro os dois caminhos de negócio, depois os indicadores
 * reais e as instruções. Os fluxos e contagens já existentes são preservados.
 * "Compradores Procurando" é o rótulo de UX; o escopo permanece a cidade da loja.
 */
const BUYERS_BENEFITS = [
  "Receba demandas reais da sua cidade",
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
    <svg
      viewBox="0 0 24 24"
      className="h-[19px] w-[19px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.4a3.4 3.4 0 0 1 0 6.6M17.5 13.4c2 .8 3.5 2.8 3.5 5.1" />
    </svg>
  ),
  vehicles: (
    <svg
      viewBox="0 0 24 24"
      className="h-[19px] w-[19px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M4 16v2.2M20 16v2.2M3 15.5c0-1.6.9-2.6 2.4-3l1.9-4c.4-.9 1.2-1.4 2.2-1.4h5c1 0 1.8.5 2.2 1.4l1.9 4c1.5.4 2.4 1.4 2.4 3v.5H3v-.5Z" />
      <circle cx="7.4" cy="15.8" r="1.1" />
      <circle cx="16.6" cy="15.8" r="1.1" />
    </svg>
  ),
} as const;

const FLOWS: readonly HowItWorksFlow[] = [
  {
    label: "Compradores Procurando",
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
    <section data-testid="dealer-opportunities-hub" className="space-y-5">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start sm:gap-5">
        <div>
          <h1 className="text-[29px] font-extrabold leading-tight tracking-[-0.035em] text-[#101B3D] sm:text-[34px]">
            Oportunidades
          </h1>
          <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-[#5D6C88] sm:text-[14px]">
            Escolha como gerar negócios: atender compradores procurando veículos ou comprar para
            repor seu estoque.
          </p>
        </div>
        <div className="flex max-w-[290px] shrink-0 items-start gap-2.5 rounded-xl border border-[#CFE1FC] bg-[#EEF5FF] px-3.5 py-2.5 text-[#184E9E]">
          <svg
            viewBox="0 0 24 24"
            className="mt-0.5 h-5 w-5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path
              d="M9 18h6M10 21h4M9 14c-1.5-1.1-2.5-2.9-2.5-5a5.5 5.5 0 0 1 11 0c0 2.1-1 3.9-2.5 5-.7.6-1 1.4-1 2H10c0-.6-.3-1.4-1-2Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M12 1v2M2.5 9H4M20 9h1.5M5.5 3.7 7 5M17 5l1.5-1.3" strokeLinecap="round" />
          </svg>
          <p className="text-[11.5px] leading-snug">
            <strong>Dica:</strong> mantenha seu estoque atualizado para receber mais oportunidades.
          </p>
        </div>
      </header>

      <DealerOpportunityAccess
        launchNotice={
          (
          <div
            className="flex items-start gap-3 rounded-2xl border border-[#CEE5FC] bg-[#F4F9FF] px-4 py-3.5 text-[#215080]"
            data-testid="dealer-launch-benefit-notice"
            aria-label="Benefício de lançamento"
          >
            <svg
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 3v18M3 12h18M4 7h16v14H4zM3 7h18" strokeLinecap="round" />
            </svg>
            <div>
              <p className="text-[13px] font-extrabold">Benefício especial de lançamento</p>
              <p className="mt-1 text-[12.5px] leading-relaxed">
                Durante o lançamento, Compradores Procurando e Veículos para Avaliação estão disponíveis
                gratuitamente para lojistas cadastrados. Futuramente, Compradores Procurando será
                exclusivo do plano Pro, e Veículos para Avaliação dos planos Start e Pro.
              </p>
            </div>
          </div>
          )
        }
        buyersCard={
          (
            <OpportunityHubChoiceCard
              tone="blue"
              art={<BuyersArt className="w-full" />}
              title="Compradores Procurando"
              description="Veja pessoas que estão procurando veículos e envie ofertas do seu estoque."
              benefits={BUYERS_BENEFITS}
              ctaLabel="Ver compradores procurando"
              ctaHref="/dashboard-loja/oportunidades/compradores"
              howItWorksHref="#como-funciona"
              testId="dealer-hub-card-buyers"
              ctaTestId="dealer-opportunities-buyers-link"
            />
          )
        }
        vehiclesCard={
          (
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
          )
        }
      />

      <OpportunityHubMetrics />
      <OpportunityHubHowItWorks flows={FLOWS} />
    </section>
  );
}
