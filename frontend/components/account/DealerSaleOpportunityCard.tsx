"use client";

import Link from "next/link";
import {
  FUEL_LABEL,
  TRANSMISSION_LABEL,
  describeVehicle,
  formatCity,
  formatMileage,
  formatMoneyValue,
  type DealerSaleOpportunitySummary,
} from "@/lib/sale-requests/dealer-api";

/**
 * Card de um veículo disponível para avaliação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UM ÚNICO NÚMERO NO CARD: O PISO DO PROPRIETÁRIO
 * ────────────────────────────────────────────────────────────────────────────
 * O valor exibido é `minimum_accepted_price` — o mínimo que a pessoa declarou
 * aceitar. Não é FIPE, não é a maior proposta, não é a proposta desta loja, não
 * é média nem estimativa. É o preço da oportunidade: abaixo dele nenhuma
 * proposta é aceita, então é exatamente o número que decide se vale abrir.
 *
 * Os outros três valores CONTINUAM chegando na resposta da API
 * (`fipe_reference_value`, `current_highest_offer`, `my_offer`) e continuam
 * sendo mostrados no DETALHE, ao lado do formulário de proposta. Nenhum campo
 * foi removido de nenhum contrato — o card é que deixou de renderizá-los.
 *
 * A versão anterior mostrava três blocos monetários lado a lado num cartão de
 * ~270px. Três números com aparência equivalente e significados opostos é o
 * jeito mais rápido de alguém propor contra a referência errada.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O TÍTULO É MARCA + MODELO; O ANO VAI PARA A GRADE
 * ────────────────────────────────────────────────────────────────────────────
 * O título divide a primeira linha com o preço. Com o ano dentro dele
 * ("Volkswagen T-Cross 2020"), num card de ~270px sobrava espaço para
 * "Volkswagen T-C…" — o modelo, que é o dado que identifica o veículo,
 * truncava para caber num ano que a grade logo abaixo poderia mostrar de graça.
 *
 * "2024/2024" (fabricação/modelo) da referência visual NÃO existe aqui: este
 * produto coleta UM ano só, derivado do código FIPE do ano-modelo. Duplicá-lo
 * com uma barra inventaria a metade que ninguém perguntou — e é uma metade que
 * muda preço de verdade.
 *
 * `describeVehicle` (com ano) continua sendo usado no `alt` da foto e no
 * detalhe, onde há largura para a frase inteira.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UMA ESTRUTURA, DOIS LAYOUTS
 * ────────────────────────────────────────────────────────────────────────────
 * No celular o card é um ITEM DE LISTA horizontal: miniatura à esquerda,
 * conteúdo à direita, altura curta. A partir de `sm` ele vira o cartão vertical
 * com a foto em 4:3 no topo. É o MESMO DOM, com classes responsivas — duplicar
 * em `CardMobile`/`CardDesktop` faria toda correção de privacidade ou de copy
 * precisar ser aplicada duas vezes, e a segunda seria esquecida.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE SAIU NA 4.3.3, E POR QUÊ
 * ────────────────────────────────────────────────────────────────────────────
 * Etiquetas de estado/leilão/laudo, "Particular" e o tempo de publicação. Não
 * por serem irrelevantes — são a ficha que o lojista lê para avaliar —, mas
 * porque a função do card é TRIAGEM: quatro linhas de texto e um preço decidem
 * se vale abrir. A ficha inteira está a um clique, na tela que tem largura para
 * ela.
 */

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

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3 shrink-0"
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
  // O título do CARD: marca + modelo. O nome completo (`describeVehicle`, com
  // ano) fica para o texto alternativo da foto, onde não disputa largura.
  const title = [opportunity.brand, opportunity.model].filter(Boolean).join(" ");
  const fullName = describeVehicle(opportunity);
  const detailHref = `${basePath}/oportunidades/veiculos/${opportunity.id}${query}`;

  /**
   * "Fazer oferta" abre o MESMO detalhe, com âncora no painel de proposta: quem
   * já decidiu cai no formulário em vez do topo da página. Não existe fluxo de
   * proposta fora do detalhe, e inventar um destino próprio para o CTA
   * prometeria uma tela que não existe.
   */
  const offerHref = `${detailHref}#proposta`;

  /**
   * O piso, formatado. `null` quando a solicitação é anterior à 4.3.3.
   *
   * A região do preço fica VAZIA nesse caso — com um traço neutro, sem rótulo.
   * As alternativas seriam pior: "R$ 0,00" afirmaria que o dono aceita
   * qualquer valor, e usar a FIPE ou a maior proposta no lugar transformaria
   * outro número em preço, que é exatamente o que a fase proíbe.
   */
  const price = formatMoneyValue(opportunity.minimum_accepted_price);

  const fuel = FUEL_LABEL[opportunity.fuel_type] || opportunity.fuel_type;
  const transmission =
    TRANSMISSION_LABEL[opportunity.transmission] || opportunity.transmission;

  return (
    <li
      className="group relative flex flex-row overflow-hidden rounded-2xl border border-[#E5E9F2] bg-white transition duration-150 hover:border-[#CFE0FB] hover:shadow-[0_10px_28px_-12px_rgba(16,24,40,0.18)] focus-within:border-[#0e62d8] focus-within:ring-1 focus-within:ring-[#0e62d8] sm:flex-col"
      data-testid="dealer-sale-opportunity-card"
    >
      {/*
        FOTO — miniatura à esquerda no celular, topo em 4:3 no desktop.

        `self-stretch` faz a miniatura acompanhar a altura da linha sem que o
        componente precise saber quanto texto há ao lado; a imagem é absoluta
        porque no modo linha o contêiner não tem altura intrínseca.
      */}
      <div className="relative w-[112px] shrink-0 self-stretch overflow-hidden bg-[#F1F4F9] sm:aspect-[4/3] sm:w-full sm:self-auto">
        {opportunity.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={opportunity.image}
            alt={`Foto de ${fullName}`}
            className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <PhotoPlaceholder />
        )}
      </div>

      {/* CONTEÚDO */}
      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
        {/*
          TÍTULO + PREÇO na mesma linha, como na referência: o olho desce a
          coluna comparando dois pontos por card, e não seis.

          O link do título carrega o `after:absolute after:inset-0` — é ele que
          torna o CARTÃO INTEIRO clicável para o detalhe. O CTA precisa de
          `relative z-10` para ficar ACIMA dessa camada; sem isso o clique no
          botão cairia no topo da página em vez do formulário de proposta.
        */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-[14px] font-bold leading-snug text-[#161f34] sm:text-[15px]">
            <Link
              href={detailHref}
              className="line-clamp-2 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
              data-testid="dealer-sale-opportunity-link"
            >
              {title}
            </Link>
          </h3>

          {price ? (
            <p
              className="shrink-0 text-[15px] font-bold leading-snug text-[#0e62d8] sm:text-[16px]"
              data-testid="dealer-card-price"
            >
              {price}
            </p>
          ) : (
            <p
              className="shrink-0 text-[15px] font-bold leading-snug text-[#98A2B3]"
              data-testid="dealer-card-price"
              aria-label="Valor mínimo não informado"
            >
              —
            </p>
          )}
        </div>

        {/*
          A VERSÃO FIPE completa. É ela que separa um EX de um LX — quinze mil
          reais de diferença no mesmo modelo e ano.
        */}
        <p className="mt-0.5 truncate text-[12px] leading-snug text-[#667085]">
          {opportunity.fipe_model_description}
        </p>

        {/*
          METADADOS EM DUAS COLUNAS, como na referência: km e cidade à esquerda,
          combustível e câmbio à direita. Em duas colunas as quatro informações
          ocupam duas linhas em vez de quatro, e nenhuma delas trunca no celular.
        */}
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] leading-snug text-[#475467]">
          <span className="truncate font-semibold text-[#1D2440]">
            {formatMileage(opportunity.mileage)}
          </span>
          <span className="truncate">{fuel}</span>
          <span className="truncate font-semibold text-[#1D2440]">{opportunity.year}</span>
          <span className="truncate">{transmission}</span>
          <span className="col-span-2 inline-flex min-w-0 items-center gap-1 truncate">
            <PinIcon />
            <span className="truncate">{formatCity(opportunity.city)}</span>
          </span>
        </div>

        {/* AÇÃO — uma só, e é a que o produto quer. */}
        <div className="mt-auto pt-3">
          <Link
            href={offerHref}
            className="relative z-10 inline-flex h-9 w-full items-center justify-center rounded-lg bg-[#0e62d8] px-3 text-[12.5px] font-bold text-white transition hover:bg-[#0b52b5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e62d8] sm:h-10 sm:text-[13px]"
            data-testid="dealer-sale-opportunity-offer"
          >
            Fazer oferta
          </Link>
        </div>
      </div>
    </li>
  );
}
