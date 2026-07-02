import type { Metadata } from "next";
import Link from "next/link";
import { requireLojistaDashboardSession } from "@/lib/account/dashboard-session";
import { getPlansByType } from "@/lib/plans/plan-service";
import { fetchPublicBoost, formatBoostPriceBRL } from "@/lib/commercial/public-boost";
import SubscriptionCheckoutButton from "@/components/plans/SubscriptionCheckoutButton";
import SubscriptionPanel from "@/components/plans/SubscriptionPanel";

export const metadata: Metadata = {
  title: "Plano e cobranças",
  description: "Planos e pagamentos da sua loja.",
};

// Lê sessão + planos vivos a cada acesso (preços vêm do banco, sem hardcode).
export const dynamic = "force-dynamic";

const PRIMARY = "#0e62d8";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(value)
    .replace(new RegExp(String.fromCharCode(160), "g"), " ");
}

/**
 * Card local desta tela (mesmo padrão visual da imagem de planos). Não exporta
 * nem mexe no design system global — só compõe a grade do painel do lojista.
 */
function PlanCardView({
  name,
  badge,
  price,
  period,
  intro,
  benefits,
  cta,
  recommended,
}: {
  name: string;
  badge?: string;
  price: string;
  period: string;
  intro: string;
  benefits: ReadonlyArray<string>;
  cta: React.ReactNode;
  recommended?: boolean;
}) {
  return (
    <article
      className={`relative flex flex-col rounded-2xl border bg-white p-5 shadow-[0_3px_18px_rgba(11,22,44,0.06)] ${
        recommended ? "border-[#0e62d8] ring-2 ring-[#0e62d8]/20" : "border-[#dfe4ef]"
      }`}
    >
      {badge ? (
        <span
          className="absolute -top-3 left-5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ backgroundColor: PRIMARY }}
        >
          {badge}
        </span>
      ) : null}

      <h3 className="text-lg font-extrabold text-[#1d2538] sm:text-xl">{name}</h3>
      <p className="mt-1 text-xs text-[#5a647d] sm:text-sm">{intro}</p>

      <p className="mt-4 flex items-baseline gap-1">
        <strong className="text-3xl font-extrabold tracking-tight text-[#0e62d8]">{price}</strong>
        <span className="text-xs font-semibold text-[#5a647d]">{period}</span>
      </p>

      <ul className="mt-4 flex-1 space-y-2 text-[13px] text-[#4f5972] sm:text-sm">
        {benefits.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#0e62d8]" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="mt-1">{cta}</div>
    </article>
  );
}

export default async function LojaPlanoPage() {
  // Mesma proteção das demais páginas do painel do lojista.
  await requireLojistaDashboardSession();

  // Preços/limites de Start/Pro vêm do banco (subscription_plans); o Destaque
  // 7 dias vem da config pública viva — mesma fonte do checkout, sem drift.
  const [plans, boost] = await Promise.all([
    getPlansByType("CNPJ").catch(() => []),
    fetchPublicBoost(),
  ]);

  // Vitrine DATA-DRIVEN: renderiza todos os planos assináveis e ativos
  // (subscribable && is_active), sem nomes hardcoded. Ordena por peso
  // decrescente (maior camada comercial primeiro, ex.: Pro antes de Start).
  const subscribablePlans = plans
    .filter((p) => p.subscribable && p.is_active)
    .sort((a, b) => Number(b.weight ?? 0) - Number(a.weight ?? 0));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-[#0f172a]">Plano e cobranças</h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Escolha o plano ideal para a operação da sua loja. O pagamento é processado pelo Mercado
          Pago.
        </p>
      </header>

      {/*
        Bloco "Sua assinatura": estado real (plano, status, próxima cobrança /
        ativa até) + cancelamento com confirmação. Client component que busca
        GET /api/payments/subscriptions/me; não renderiza nada para quem está
        no plano gratuito ({status:'none'}).
      */}
      <SubscriptionPanel />

      <section aria-label="Planos disponíveis" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Destaque 7 dias é POR ANÚNCIO (boost). Leva à escolha do anúncio,
            onde o checkout do destaque (já em produção) é disparado. */}
        <PlanCardView
          name={boost.name}
          badge={`TOPO ${boost.duration_days} DIAS`}
          price={formatBoostPriceBRL(boost.price_cents)}
          period="por anúncio"
          intro={`Coloque um anúncio no topo das listagens da sua cidade por ${boost.duration_days} dias.`}
          benefits={[
            `Posição de destaque por ${boost.duration_days} dias`,
            "Compras repetidas prorrogam o tempo no topo",
            "Não altera limite de anúncios ou fotos",
          ]}
          cta={
            <Link
              href="/dashboard-loja/meus-anuncios"
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(120deg,#f59e0b_0%,#f97316_100%)] px-4 text-sm font-bold text-white transition hover:brightness-110"
            >
              Escolher anúncio
            </Link>
          }
        />

        {subscribablePlans.map((plan, idx) => (
          <PlanCardView
            key={plan.id}
            name={plan.name}
            badge={plan.recommended ? "RECOMENDADO" : undefined}
            price={formatBRL(plan.price)}
            period="/mês"
            intro={plan.description || "Plano de assinatura mensal para a loja."}
            benefits={
              plan.benefits?.length
                ? plan.benefits
                : [`Até ${plan.ad_limit} anúncios ativos`, "Mais presença nas listagens"]
            }
            recommended={Boolean(plan.recommended)}
            cta={
              <SubscriptionCheckoutButton
                planId={plan.id}
                label={`Assinar ${plan.name}`}
                variant={idx === 0 ? "primary" : "outline"}
              />
            }
          />
        ))}

        <PlanCardView
          name="Grátis"
          price="R$ 0"
          period="para sempre"
          intro="Comece a anunciar sem mensalidade, respeitando o limite do plano gratuito da loja."
          benefits={["Loja com CNPJ: até 10 anúncios", "Até 8 fotos por anúncio", "Sem comissão"]}
          cta={
            <span className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl border border-[#dfe4ef] bg-[#f8fafe] px-4 text-sm font-semibold text-[#64748b]">
              Plano de entrada
            </span>
          }
        />
      </section>
    </div>
  );
}
