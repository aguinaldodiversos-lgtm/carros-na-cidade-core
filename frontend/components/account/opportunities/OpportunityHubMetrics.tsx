"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TREND_EXPLANATION,
  describeTrend,
  fetchOpportunitiesSummary,
  type DealerOpportunitiesSummary,
  type OpportunityMetric,
} from "@/lib/account/opportunities-summary";

/**
 * Os quatro cartões-resumo do topo do hub.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TODO NÚMERO AQUI É CONTADO NO BANCO
 * ════════════════════════════════════════════════════════════════════════════
 * Nenhum é estimado, nenhum é derivado de outro e nenhum é decorativo. Cada um
 * sai de um `COUNT(*)` sobre a MESMA partição da lista que o cartão resume — se
 * este cartão diz 76, a tela de veículos para avaliação abre com 76.
 *
 * A variação percentual compara o que ENTROU nos últimos 7 dias com o que entrou
 * nos 7 dias anteriores, lido de `created_at`. Quando a janela anterior é zero,
 * o backend devolve `trend: null` e a etiqueta verde dá lugar a "sem base de
 * comparação" — porque "+100%" para 0 → 1 seria uma promessa de tendência numa
 * cidade com uma solicitação.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O ESQUELETO TEM A ALTURA DO CARTÃO CHEIO
 * ════════════════════════════════════════════════════════════════════════════
 * Sem isso a faixa nasce baixa e cresce quando o resumo chega, empurrando os
 * dois cartões grandes para baixo — o clique que a pessoa começou a dar no meio
 * do carregamento acerta outra coisa.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * FALHA NÃO VIRA ZERO
 * ════════════════════════════════════════════════════════════════════════════
 * Se o resumo não carrega, a faixa some e uma linha discreta oferece "Tentar
 * novamente". Mostrar `0` seria pior do que não mostrar nada: o lojista leria
 * "não há compradores na minha cidade" e fecharia a tela.
 */

type MetricTone = "blue" | "teal" | "indigo" | "amber";

const TONE: Record<MetricTone, { bg: string; fg: string }> = {
  blue: { bg: "bg-[#EAF2FF]", fg: "text-[#0e62d8]" },
  teal: { bg: "bg-[#E3F7F1]", fg: "text-[#0E9384]" },
  indigo: { bg: "bg-[#EEEBFF]", fg: "text-[#5925DC]" },
  amber: { bg: "bg-[#FFF1E6]", fg: "text-[#C4570F]" },
};

const ICON = {
  buyers: (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.4a3.4 3.4 0 0 1 0 6.6M17.5 13.4c2 .8 3.5 2.8 3.5 5.1" />
    </svg>
  ),
  car: (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 16v2.2M20 16v2.2M3 15.5c0-1.6.9-2.6 2.4-3l1.9-4c.4-.9 1.2-1.4 2.2-1.4h5c1 0 1.8.5 2.2 1.4l1.9 4c1.5.4 2.4 1.4 2.4 3v.5H3v-.5Z" />
      <circle cx="7.4" cy="15.8" r="1.1" />
      <circle cx="16.6" cy="15.8" r="1.1" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 19V11M12 19V5M19 19v-6" strokeLinecap="round" />
    </svg>
  ),
  deal: (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.5 6.5 7l3.2 3.2a2 2 0 0 0 2.8 0L15 7.5" />
      <path d="M21 10.5 17.5 7l-2 1.6" />
      <path d="M6.5 14.5 9 17l1.6-1.6L12.4 17l1.6-1.6L15.6 17l2.2-2.2" />
    </svg>
  ),
} as const;

function TrendLine({
  metric,
  entriesLabel,
}: {
  metric: OpportunityMetric;
  entriesLabel: string;
}) {
  const trend = describeTrend(metric.trend, entriesLabel);

  const toneClass =
    trend.tone === "positive"
      ? "text-[#067647]"
      : trend.tone === "negative"
        ? "text-[#B42318]"
        : "text-[#98A2B3]";

  return (
    /*
      `title` carrega a explicação da janela (§6). É o atributo nativo, e não um
      componente de tooltip novo: o projeto não tem um, e criar biblioteca para
      uma frase seria trocar um problema de texto por um de manutenção.

      O mesmo texto vai em `aria-label`, porque `title` não é anunciado de forma
      confiável por leitor de tela. A frase começa pelo rótulo visível para que a
      leitura não perca o número.
    */
    /*
      `xl:min-h-[29px]` — DUAS LINHAS RESERVADAS, pelo mesmo motivo do rótulo.

      "novas entradas em 7 dias" é o texto mais longo dos quatro e quebra em duas
      linhas na largura de quatro colunas. Com `items-center` no cartão, um bloco
      de texto mais alto sobe o número dele em ~7px — e a régua horizontal dos
      quatro números, que é o que faz a faixa ser lida de relance, deixa de
      existir.

      Isso não foi previsto: foi a asserção de altura no E2E que acusou
      (`números em 2 alturas diferentes: 306, 306, 299, 306`). A correção de copy
      tinha um custo de layout que nenhum teste de texto veria.
    */
    <p
      className={`mt-1 text-[11.5px] font-semibold leading-tight xl:min-h-[29px] ${toneClass}`}
      title={TREND_EXPLANATION}
      aria-label={`${trend.label}. ${TREND_EXPLANATION}`}
      data-testid="dealer-hub-trend"
    >
      {/*
        O glifo acompanha a cor (§ acessibilidade): quem não distingue verde de
        vermelho continua lendo a direção. A seta é `aria-hidden` porque o texto
        ao lado já diz "+18%" — anunciá-la produziria "seta para cima mais 18 por
        cento".
      */}
      {trend.tone !== "neutral" ? (
        <span aria-hidden="true">{trend.tone === "positive" ? "▲ " : "▼ "}</span>
      ) : null}
      {trend.label}
    </p>
  );
}

function MetricCard({
  label,
  hint,
  entriesLabel,
  metric,
  tone,
  icon,
  testId,
}: {
  label: string;
  /** O que o NÚMERO conta, quando o rótulo sozinho não deixa claro. */
  hint?: string;
  /** O que ENTROU na janela — completa a frase da tendência. */
  entriesLabel: string;
  metric: OpportunityMetric;
  tone: MetricTone;
  icon: React.ReactNode;
  testId: string;
}) {
  return (
    <li
      className="flex items-center gap-3.5 rounded-2xl border border-[#E8ECF4] bg-white p-4 shadow-[0_1px_3px_rgba(16,32,64,0.04)] sm:p-5"
      data-testid={testId}
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${TONE[tone].bg} ${TONE[tone].fg}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        {/*
          DUAS LINHAS RESERVADAS PARA O RÓTULO — A PARTIR DE `xl`, E SÓ ALI.

          `xl` é onde a faixa vira QUATRO colunas. Nessa largura "Novas
          oportunidades hoje" não cabe em uma linha e quebra — só ele. Sem a
          reserva, o número desse cartão desce ~16px e a régua perde o
          alinhamento horizontal que a faz ser lida de relance: o olho varre os
          quatro números na mesma altura, e um fora de linha vira um solavanco.

          Abaixo de `xl` os cartões são largos (duas colunas ou um por linha),
          nenhum rótulo quebra, e a reserva viraria 16px de vão morto entre o
          rótulo e o número — bem visível no celular.

          Reservar em TODOS os cartões daquela faixa (e não encolher a fonte do
          que quebra) é o que mantém o alinhamento mesmo se um rótulo mudar de
          tamanho depois.
        */}
        <p
          className="flex items-start text-[12.5px] leading-tight text-[#667085] xl:min-h-[31px]"
          /*
            `hint` explica o que o NÚMERO conta, quando o rótulo curto não basta.
            Vai em `title` porque é desambiguação, não conteúdo: quem já entendeu
            o cartão não precisa de mais uma linha de texto na régua.
          */
          title={hint}
        >
          {label}
        </p>
        <p className="text-[26px] font-bold leading-none tabular-nums text-[#161f34]">
          {metric.total.toLocaleString("pt-BR")}
        </p>
        <TrendLine metric={metric} entriesLabel={entriesLabel} />
      </div>
    </li>
  );
}

/** Esqueleto com a MESMA altura do cartão cheio — sem salto de layout. */
function MetricSkeleton() {
  return (
    <li className="flex items-center gap-3.5 rounded-2xl border border-[#E8ECF4] bg-white p-4 sm:p-5">
      <span className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-[#EEF2F8]" />
      {/*
        A CAIXA DE CADA LINHA ESPELHA A DO CARTÃO CHEIO — inclusive o
        `xl:min-h-[31px]` do rótulo, que só vale a partir daquela largura.

        Copiar a ALTURA DA CAIXA (e não a do tracinho cinza dentro dela) é o que
        importa: um esqueleto que só imitasse o texto de uma linha ficaria 16px
        mais baixo em `xl` e a página saltaria quando o resumo chegasse — o
        clique que a pessoa começou a dar acertaria outra coisa.
      */}
      <div className="min-w-0 flex-1">
        <span className="flex items-start xl:min-h-[31px]">
          <span className="block h-[13px] w-24 animate-pulse rounded bg-[#EEF2F8]" />
        </span>
        <span className="block h-[26px] w-14 animate-pulse rounded bg-[#EEF2F8]" />
        <span className="mt-1 flex xl:min-h-[29px]">
          <span className="block h-[14px] w-28 animate-pulse rounded bg-[#F4F6FA]" />
        </span>
      </div>
    </li>
  );
}

export default function OpportunityHubMetrics() {
  const [summary, setSummary] = useState<DealerOpportunitiesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setSummary(await fetchOpportunitiesSummary());
    } catch {
      // Silencioso na tela, e de propósito: a faixa é um resumo, não o conteúdo.
      // Um alarme vermelho no topo por causa dela empurraria os dois cartões que
      // realmente levam a algum lugar.
      setFailed(true);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <ul
        className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4"
        data-testid="dealer-hub-metrics-loading"
      >
        {[0, 1, 2, 3].map((key) => (
          <MetricSkeleton key={key} />
        ))}
      </ul>
    );
  }

  if (failed || !summary) {
    return (
      <p
        className="mb-5 rounded-2xl border border-[#E8ECF4] bg-white px-4 py-3 text-[12.5px] text-[#667085]"
        data-testid="dealer-hub-metrics-error"
      >
        Não foi possível carregar o resumo agora.{" "}
        <button
          type="button"
          onClick={() => void load()}
          className="font-bold text-[#0e62d8] hover:underline"
        >
          Tentar novamente
        </button>
      </p>
    );
  }

  return (
    <ul
      className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4"
      data-testid="dealer-hub-metrics"
    >
      {/*
        ────────────────────────────────────────────────────────────────────────
        CADA CARTÃO DIZ O QUE ENTROU — E SÓ UM PRECISA DIZER A JANELA
        ────────────────────────────────────────────────────────────────────────
        Nos três primeiros, o `entriesLabel` é "novas entradas": procuras e
        solicitações que chegaram na janela. No quarto é "novas compras", porque
        o que entra ali é negócio fechado, não oportunidade recebida — e
        "entradas" ali seria generalidade a ponto de mentir.

        "Novas oportunidades hoje" é o ÚNICO que declara a janela no rótulo
        ("em 7 dias"). O motivo é a divergência entre número e tendência: o
        número conta HOJE, a tendência compara semanas. Nos outros três o número
        é estoque atual e não sugere janela nenhuma, então repetir "em 7 dias"
        quatro vezes só encheria a régua. Aqui, sem isso, "+9% novas entradas"
        embaixo de um número diário se leria como "9% a mais que ontem".
      */}
      <MetricCard
        label="Compradores ativos"
        hint="Procuras de compra ativas e não vencidas na cidade da sua loja."
        entriesLabel="novas entradas"
        metric={summary.active_buyers}
        tone="blue"
        icon={ICON.buyers}
        testId="dealer-hub-metric-buyers"
      />
      <MetricCard
        label="Veículos para avaliação"
        hint="Veículos recebendo propostas na cidade da sua loja."
        entriesLabel="novas entradas"
        metric={summary.sale_requests}
        tone="teal"
        icon={ICON.car}
        testId="dealer-hub-metric-vehicles"
      />
      <MetricCard
        label="Novas oportunidades hoje"
        hint="Procuras e veículos publicados hoje na cidade da sua loja."
        entriesLabel="novas entradas em 7 dias"
        metric={summary.new_today}
        tone="indigo"
        icon={ICON.chart}
        testId="dealer-hub-metric-new-today"
      />
      {/*
        "COMPRAS em andamento", e não "negócios".

        A fonte conta UMA coisa: solicitações de venda cuja oferta selecionada é
        desta loja. Isso é o lado COMPRA do produto — veículos que a loja está
        adquirindo para repor estoque. "Negócios" abrangeria também o lado venda
        (ofertas enviadas a compradores ativos), e esse lado NÃO está aqui:
        `purchase_intent_offers` não tem ciclo de vida que permita distinguir uma
        oferta viva de uma abandonada, e contá-las todas inflaria o número com
        negócio que não existe mais.

        O rótulo amplo era o defeito: prometia os dois produtos e entregava um.
      */}
      <MetricCard
        label="Compras em andamento"
        hint="Veículos em processo de compra pela sua loja."
        entriesLabel="novas compras"
        metric={summary.deals_in_progress}
        tone="amber"
        icon={ICON.deal}
        testId="dealer-hub-metric-deals"
      />
    </ul>
  );
}
