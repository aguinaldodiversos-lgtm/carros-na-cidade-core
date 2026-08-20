"use client";

import Link from "next/link";
import {
  DECLARED_CONDITION_LABEL,
  FUEL_LABEL,
  TRANSMISSION_LABEL,
  describeVehicle,
  formatCity,
  formatMileage,
  formatPublishedAt,
  type DealerSaleOpportunitySummary,
} from "@/lib/sale-requests/dealer-api";

/**
 * Card de um veículo disponível para avaliação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O CARD É TRIAGEM; O DETALHE É DECISÃO
 * ────────────────────────────────────────────────────────────────────────────
 * A pergunta que este card responde é "vale abrir?", e não "quanto eu ofereço?".
 * Tudo que serve para decidir VALOR — referência FIPE, maior proposta, a
 * proposta desta loja, distância para a FIPE — saiu daqui e vive apenas na
 * página de detalhe, onde há largura para os números e onde o formulário de
 * proposta está a um palmo deles.
 *
 * A versão anterior mostrava os três valores no card. Numa grade de quatro
 * colunas isso produzia três blocos monetários competindo entre si em ~270px, e
 * o lojista precisava ler dinheiro para decidir se queria olhar o carro.
 *
 * O dado continua no CONTRATO da API: `fipe_reference_value`,
 * `current_highest_offer` e `my_offer` seguem chegando na mesma resposta, e o
 * detalhe os consome. O card é que deixou de renderizá-los — nenhum campo foi
 * removido de nenhuma rota, nenhum DTO mudou.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UMA ESTRUTURA, DOIS LAYOUTS
 * ────────────────────────────────────────────────────────────────────────────
 * No celular o card é um ITEM DE LISTA horizontal: miniatura à esquerda,
 * conteúdo à direita, altura curta — dá para varrer muitos veículos numa
 * rolagem. A partir de `sm` ele vira o cartão vertical com a foto em 4:3 no
 * topo.
 *
 * É o MESMO DOM nos dois casos, com classes responsivas: `flex-row` →
 * `sm:flex-col`, miniatura de largura fixa → `sm:w-full` com `aspect-[4/3]`.
 * Duplicar em `CardMobile`/`CardDesktop` faria toda correção de privacidade ou
 * de copy precisar ser aplicada duas vezes — e a segunda seria esquecida.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE NÃO ENTROU
 * ────────────────────────────────────────────────────────────────────────────
 * A referência visual traz coração de favoritar, selos "Urgente"/"Bom
 * potencial", cronômetro e nota de reputação da loja. Nenhum dos quatro entrou:
 *
 *   • favoritar não tem entidade de persistência — seria um botão que esquece o
 *     clique ao recarregar;
 *   • "Urgente"/"Bom potencial" e nota de reputação não têm algoritmo por trás.
 *     Um selo desses faz o lojista priorizar por um sinal que o sistema não tem;
 *   • cronômetro exigiria prazo, e este produto não expira solicitação.
 *
 * O único sinal temporal é "há N dias", derivado de `created_at`.
 */

/**
 * Etiqueta compacta de triagem.
 *
 * A cor acompanha, mas nunca carrega sozinha: o texto diz "Sem leilão" ou
 * "Laudo com apontamentos" por extenso, então quem não distingue verde de âmbar
 * lê exatamente a mesma informação.
 */
const CHIP_TONE = {
  good: "bg-[#ECFDF3] text-[#067647]",
  warn: "bg-[#FFF8F0] text-[#B54708]",
  bad: "bg-[#FEF3F2] text-[#B42318]",
  muted: "bg-[#F2F4F7] text-[#475467]",
} as const;

type ChipTone = keyof typeof CHIP_TONE;

function Chip({
  label,
  tone,
  className = "",
}: {
  label: string;
  tone: ChipTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-md px-1.5 py-1 text-[10.5px] font-semibold leading-none sm:text-[11px] ${CHIP_TONE[tone]} ${className}`}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Placeholder quando a solicitação não tem foto. */
function PhotoPlaceholder() {
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-[#F1F4F9] text-[#C3CDDE]"
      data-testid="dealer-sale-opportunity-no-photo"
    >
      <svg
        viewBox="0 0 40 40"
        className="h-7 w-7 sm:h-10 sm:w-10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 14h4l2.4-3.4h15.2L30 14h4v12H6z" />
        <circle cx="20" cy="20" r="4.6" />
      </svg>
    </div>
  );
}

function PinIcon({ className = "h-3 w-3 shrink-0" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden="true"
    >
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

/**
 * "45.000 km · Flex · Automático" — a linha que o lojista compara entre cards.
 *
 * O ANO não entra aqui porque já está no título (`describeVehicle` devolve
 * "Volkswagen T-Cross 2020"). Repeti-lo custaria a largura de um dado novo para
 * dizer o que a linha de cima já disse.
 */
function specLine(opportunity: DealerSaleOpportunitySummary): string {
  return [
    formatMileage(opportunity.mileage),
    FUEL_LABEL[opportunity.fuel_type] || opportunity.fuel_type,
    TRANSMISSION_LABEL[opportunity.transmission] || opportunity.transmission,
  ]
    .filter(Boolean)
    .join(" · ");
}

const CONDITION_TONE: Record<string, ChipTone> = {
  excelente: "good",
  bom: "good",
  regular: "warn",
  precisa_reparos: "bad",
};

/** Leilão em UMA etiqueta curta. `null` (não declarado) não vira etiqueta. */
function auctionChip(value: string | null): { label: string; tone: ChipTone } | null {
  if (value === "no") return { label: "Sem leilão", tone: "good" };
  if (value === "yes") return { label: "Leilão: sim", tone: "bad" };
  if (value === "unknown") return { label: "Leilão: não sei", tone: "muted" };
  return null;
}

/**
 * Laudo cautelar em UMA etiqueta curta.
 *
 * "Sem laudo" é `not_available` — o proprietário declarou que NÃO possui laudo,
 * o que é diferente de `null` (não respondeu) e de `unknown` (não sabe se
 * possui). As três situações produzem etiquetas diferentes, ou nenhuma.
 */
function cautionChip(value: string | null): { label: string; tone: ChipTone } | null {
  if (value === "approved") return { label: "Laudo aprovado", tone: "good" };
  if (value === "approved_with_notes") return { label: "Laudo com apontamentos", tone: "warn" };
  if (value === "rejected") return { label: "Laudo reprovado", tone: "bad" };
  if (value === "not_available") return { label: "Sem laudo", tone: "muted" };
  if (value === "unknown") return { label: "Laudo: não sei", tone: "muted" };
  return null;
}

export default function DealerSaleOpportunityCard({
  opportunity,
  basePath,
  /** Query preservada no link (a loja escolhida, quando há mais de uma). */
  query = "",
}: {
  opportunity: DealerSaleOpportunitySummary;
  basePath: string;
  query?: string;
}) {
  const { evaluation } = opportunity;
  const title = describeVehicle(opportunity);

  const detailHref = `${basePath}/oportunidades/veiculos/${opportunity.id}${query}`;

  /**
   * "Avaliar agora" leva ao MESMO destino de "Ver detalhes", com âncora no
   * painel de proposta.
   *
   * Dois botões para a mesma URL crua seriam custo de decisão sem ganho — o que
   * separa os dois é ONDE a página abre: quem já decidiu cai no formulário, quem
   * quer conferir a ficha entra pelo topo. Não existe fluxo de avaliação fora do
   * detalhe, e inventar um destino próprio para o CTA principal prometeria uma
   * tela que não existe.
   */
  const evaluateHref = `${detailHref}#proposta`;

  const condition = DECLARED_CONDITION_LABEL[opportunity.declared_condition];
  const auction = auctionChip(evaluation.auction_history);
  const caution = cautionChip(evaluation.caution_report_status);

  return (
    <li
      className="group relative flex flex-row overflow-hidden rounded-2xl border border-[#E5E9F2] bg-white transition duration-150 hover:border-[#CFE0FB] hover:shadow-[0_10px_28px_-12px_rgba(16,24,40,0.18)] focus-within:border-[#0e62d8] focus-within:ring-1 focus-within:ring-[#0e62d8] sm:flex-col"
      data-testid="dealer-sale-opportunity-card"
    >
      {/*
        FOTO — miniatura à esquerda no celular, topo em 4:3 no desktop.

        `self-stretch` faz a miniatura acompanhar a altura da linha sem que o
        componente precise saber quanto texto o conteúdo tem; a imagem é absoluta
        porque no modo linha o contêiner não tem altura intrínseca.
      */}
      <div className="relative w-[112px] shrink-0 self-stretch overflow-hidden bg-[#F1F4F9] sm:aspect-[4/3] sm:w-full sm:self-auto">
        {opportunity.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={opportunity.image}
            alt={`Foto de ${title}`}
            className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <PhotoPlaceholder />
        )}

        {/* No desktop a cidade fica sobre a foto e não gasta linha de texto. Na
            miniatura de 112px não caberia, então ali ela volta ao conteúdo. */}
        <span className="absolute left-2.5 top-2.5 hidden items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm sm:inline-flex">
          <PinIcon />
          {formatCity(opportunity.city)}
        </span>
      </div>

      {/* CONTEÚDO */}
      <div className="flex min-w-0 flex-1 flex-col p-2.5 sm:p-4">
        <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-[#161f34] sm:truncate sm:text-[15px]">
          {title}
        </h3>

        {/*
          A VERSÃO FIPE completa, e não uma linha de specs inventada. É ela que
          separa um EX de um LX — quinze mil reais de diferença no mesmo modelo e
          ano. O título traz marca, modelo comercial e ano; esta linha traz o que
          o título não consegue carregar sem estourar.
        */}
        <p className="mt-0.5 truncate text-[12px] leading-snug text-[#667085]">
          {opportunity.fipe_model_description}
        </p>

        <p className="mt-1.5 text-[12.5px] font-semibold leading-snug text-[#1D2440] sm:text-[13px]">
          {specLine(opportunity)}
        </p>

        {/*
          UMA LINHA PARA TRÊS METADADOS.

          "Particular" é um FATO deste produto, não rótulo decorativo: todo
          veículo aqui vem de pessoa física, e é o que diferencia este feed do
          estoque entre lojas.

          A CIDADE entra aqui só no celular — no desktop ela fica sobre a foto,
          onde não custa linha nenhuma. Ao lado da miniatura de 112px o chip não
          caberia, e uma linha só para ela levava o item de lista a 208px de
          altura: quatro veículos por tela em vez de cinco.
        */}
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-[#98A2B3]">
          <span className="inline-flex max-w-full items-center gap-1 font-medium text-[#667085] sm:hidden">
            <PinIcon />
            <span className="truncate">{formatCity(opportunity.city)}</span>
          </span>
          <span className="sm:hidden" aria-hidden="true">
            ·
          </span>
          <span className="font-medium text-[#667085]">Particular</span>
          <span aria-hidden="true">·</span>
          <span>{formatPublishedAt(opportunity.created_at)}</span>
        </p>

        {/*
          NO MÁXIMO TRÊS ETIQUETAS, E TRÊS DE VERDADE.

          Estado declarado, leilão e laudo — as três que mudam a decisão de
          abrir. Financiamento, pneus, IPVA, multas, mecânica e pintura ficam na
          ficha do detalhe: no card viravam uma parede de chips em que nenhuma se
          lia.

          No celular a terceira (laudo) fica oculta: ao lado de uma miniatura de
          112px, três etiquetas quebram em duas linhas e alongam o item de lista
          justamente onde a compactação é o ponto.
        */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:mt-2">
          {condition ? (
            <Chip
              label={condition}
              tone={CONDITION_TONE[opportunity.declared_condition] ?? "muted"}
            />
          ) : null}
          {auction ? <Chip label={auction.label} tone={auction.tone} /> : null}
          {caution ? (
            <Chip label={caution.label} tone={caution.tone} className="hidden sm:inline-flex" />
          ) : null}
        </div>

        {/*
          AÇÕES — lado a lado no celular, empilhadas no desktop.

          "Ver detalhes" carrega o `after:absolute after:inset-0`: é ele que faz
          o CARTÃO INTEIRO ser clicável, padrão que esta base já usa. "Avaliar
          agora" precisa de `relative z-10` para ficar ACIMA dessa camada — sem
          isso o botão principal seria engolido pelo link do cartão e todo clique
          cairia no topo da página em vez do formulário de proposta.
        */}
        <div className="mt-auto flex items-center gap-2 pt-2.5 sm:flex-col sm:items-stretch sm:gap-1.5 sm:pt-3.5">
          <Link
            href={evaluateHref}
            className="relative z-10 inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-[#0e62d8] px-3 text-[12.5px] font-bold text-white transition hover:bg-[#0b52b5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e62d8] sm:h-10 sm:w-full sm:text-[13px]"
            data-testid="dealer-sale-opportunity-evaluate"
          >
            Avaliar agora
          </Link>

          <Link
            href={detailHref}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-[#DBE7FB] bg-white px-3 text-[12.5px] font-semibold text-[#0e62d8] transition hover:bg-[#F5F9FF] after:absolute after:inset-0 after:content-[''] sm:w-full"
            data-testid="dealer-sale-opportunity-link"
          >
            Ver detalhes
          </Link>
        </div>
      </div>
    </li>
  );
}
