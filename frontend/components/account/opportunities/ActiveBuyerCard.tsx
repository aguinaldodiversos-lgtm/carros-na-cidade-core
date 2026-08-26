"use client";

import Link from "next/link";
import ActiveBuyerArt from "./ActiveBuyerArt";
import {
  INTENT_MODE_BADGE,
  artBodyTypeFor,
  describeOpportunityCriteria,
  describeOpportunityTitle,
  formatBudgetParts,
  formatCity,
  formatPublishedAt,
  type DealerOpportunity,
} from "@/lib/purchase-intents/api";

/**
 * UM comprador ativo.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O CARD PODE DIZER
 * ════════════════════════════════════════════════════════════════════════════
 * Critério da procura, orçamento declarado, cidade e há quanto tempo foi
 * publicada. Nada mais — e não porque algo esteja escondido aqui: o DTO do
 * lojista não traz nome, e-mail, telefone nem id de usuário. A allowlist de
 * colunas do repository (`DEALER_COLUMNS`) nunca os tira do banco, e a query
 * sequer faz JOIN em `users`.
 *
 * Não há "ver contato", "chamar no WhatsApp" nem "agendar" porque nenhum desses
 * fluxos existe neste produto. O caminho é enviar um VEÍCULO do estoque, e ele
 * mora no detalhe.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ALTURA UNIFORME COM CONTEÚDO DE TAMANHOS DIFERENTES
 * ════════════════════════════════════════════════════════════════════════════
 * "Volkswagen Gol" e "SUV até R$ 90.000" ocupam alturas diferentes, e a linha de
 * critérios pode não existir. Sem tratamento, o CTA de cada card pararia numa
 * altura, e a linha do grid viraria uma escada.
 *
 * O card é `flex-col h-full` e o CTA carrega `mt-auto`: o espaço sobrando é
 * empurrado para cima do botão, não para baixo dele. O `<li>` estica porque
 * `align-items: stretch` é o padrão do grid — nenhuma altura fixa é declarada,
 * então nada é truncado para caber.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SEM MENU DE TRÊS PONTOS
 * ════════════════════════════════════════════════════════════════════════════
 * A referência visual traz um "⋮" no canto de cada card. Ele não está aqui: não
 * existe nenhuma ação de lojista sobre uma procura alheia — não dá para editar,
 * arquivar, ocultar nem denunciar. Um botão que abre um menu vazio (ou que não
 * abre nada) é pior do que a ausência dele: ensina um gesto que não leva a
 * lugar nenhum. Fidelidade visual não justifica controle morto.
 */
export default function ActiveBuyerCard({
  opportunity,
  basePath,
}: {
  opportunity: DealerOpportunity;
  basePath: string;
}) {
  const badge = INTENT_MODE_BADGE[opportunity.intent_type];
  const title = describeOpportunityTitle(opportunity);
  const criteria = describeOpportunityCriteria(opportunity);
  const budget = formatBudgetParts(opportunity.max_price);
  const city = formatCity(opportunity.city);
  const published = formatPublishedAt(opportunity.created_at);

  return (
    <li className="h-full" data-testid="active-buyer-card">
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#e5eaf3] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_-14px_rgba(16,24,40,0.18)] transition hover:border-[#cfe0fb] hover:shadow-[0_1px_2px_rgba(16,24,40,0.05),0_14px_30px_-16px_rgba(16,24,40,0.26)]">
        {/*
          A ILUSTRAÇÃO E A ETIQUETA DIVIDEM A MESMA CAIXA.

          A etiqueta é posicionada SOBRE a figura, como na referência, mas vem
          ANTES dela no DOM: é o primeiro dado que o card comunica, e a ordem de
          leitura por teclado e leitor de tela deve ser a mesma da leitura
          visual.
        */}
        <div className="relative bg-[#f7faff] px-3 pt-3">
          <span
            className={`absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none ${badge.className}`}
            data-testid="active-buyer-badge"
            data-intent-type={opportunity.intent_type}
          >
            {/*
              A etiqueta NÃO depende só da cor: o texto ("Compra específica" /
              "Categoria aberta") diz a mesma coisa. Quem não distingue azul de
              verde lê o modo do mesmo jeito.
            */}
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4l2.5 2" />
            </svg>
            {badge.label}
          </span>

          {/*
            `w-full` sem altura fixa: a figura escala pela LARGURA e a altura
            sai da proporção do `viewBox` (320×112). Fixar a altura faria o SVG
            ser encaixado por ela, sobrando barras laterais vazias e encolhendo
            o carro para metade da largura do card.
          */}
          <ActiveBuyerArt bodyType={artBodyTypeFor(opportunity)} className="block w-full" />
        </div>

        <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5">
          <h3
            className="text-[16px] font-bold leading-snug tracking-[-0.01em] text-[#161f34]"
            data-testid="active-buyer-title"
          >
            {title}
          </h3>

          {/*
            A linha de critérios SÓ existe quando há critério declarado.
            `describeOpportunityCriteria` devolve "" quando não há nenhum — e um
            `<p>` vazio deixaria um vão de ~20px que desalinha o card em relação
            aos vizinhos da mesma linha.
          */}
          {criteria ? (
            <p className="mt-1 text-[13px] leading-relaxed text-[#667085]" data-testid="active-buyer-criteria">
              {criteria}
            </p>
          ) : null}

          <div className="mt-3.5 border-t border-[#f1f4f9] pt-3.5">
            {/*
              O ORÇAMENTO é o dado comercial do card, e por isso é o único em
              azul e em corpo grande.

              "Até" fica pequeno ao lado do número de propósito: o comprador
              declarou um TETO, não o preço de um carro. Sem essa palavra o
              número leria como precificação — e o lojista ofereceria como se
              houvesse um veículo já avaliado do outro lado.
            */}
            <p className="flex items-baseline gap-1.5" data-testid="active-buyer-budget">
              <svg viewBox="0 0 24 24" className="mr-0.5 h-4 w-4 shrink-0 self-center text-[#0e62d8]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M20.6 13.4 12 4.8H4.8V12l8.6 8.6a2 2 0 0 0 2.8 0l4.4-4.4a2 2 0 0 0 0-2.8Z" />
                <circle cx="8.6" cy="8.6" r="1.4" />
              </svg>
              {budget.value ? (
                <>
                  <span className="text-[13px] font-semibold text-[#475467]">{budget.prefix}</span>
                  <span className="text-[19px] font-extrabold leading-none tracking-[-0.02em] text-[#0e62d8]">
                    {budget.value}
                  </span>
                </>
              ) : (
                <span className="text-[14px] font-semibold text-[#667085]">{budget.fallback}</span>
              )}
            </p>

            {city ? (
              <p className="mt-2 flex items-center gap-2 text-[13px] text-[#667085]" data-testid="active-buyer-city">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#98a2b3]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" />
                  <circle cx="12" cy="10" r="2.6" />
                </svg>
                {city}
              </p>
            ) : null}

            {published ? (
              <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-[#98a2b3]" data-testid="active-buyer-published">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 7.5V12l3 2" />
                </svg>
                {published}
              </p>
            ) : null}
          </div>

          {/*
            `mt-auto` no ENVOLTÓRIO é o que alinha o CTA entre cards de alturas
            diferentes, e `pt-4` é o piso desse espaço: sem ele, o card MAIS ALTO
            da linha — aquele que consome toda a folga — encostaria o botão na
            linha de "Publicado há X dias".

            O `mt-auto` vive no `div`, e não no `<a>`, porque `margin` em
            elemento `inline-flex` dentro de um container `flex-col` funciona,
            mas mistura o espaçamento do LAYOUT com o do botão — e a próxima
            pessoa a mexer no `h-11` mexeria nos dois sem querer.

            O texto acessível repete o título porque "Ver oportunidade" sozinho,
            lido fora de contexto numa lista de vinte links iguais, não diz qual
            oportunidade é.
          */}
          <div className="mt-auto pt-4">
            <Link
              href={`${basePath}/oportunidades/compradores/${opportunity.id}`}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0e62d8] px-4 text-[14px] font-bold text-white transition hover:bg-[#0b52b8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e62d8]"
              data-testid="active-buyer-cta"
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
                <circle cx="12" cy="12" r="3.1" />
              </svg>
              Ver oportunidade
              <span className="sr-only">— {title}</span>
            </Link>
          </div>
        </div>
      </article>
    </li>
  );
}
