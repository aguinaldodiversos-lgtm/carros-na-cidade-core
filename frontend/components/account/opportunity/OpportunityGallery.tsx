"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A galeria do detalhe da oportunidade (Fase 4.11A, §10 a §12 e §38).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O PROBLEMA REAL: A FOTO É DE QUEM PUBLICOU, NÃO DE UM ESTÚDIO
 * ════════════════════════════════════════════════════════════════════════════
 * As fotos vêm do celular do proprietário. Chegam deitadas, em pé, muito perto,
 * com o carro encostado numa borda. Um `object-cover` numa moldura fixa resolve
 * o enquadramento médio e destrói os extremos: numa foto vertical de 3:4 dentro
 * de uma moldura 16:9, o `cover` descarta cerca de 60% da altura — e o que sobra
 * costuma ser a lataria do meio, sem frente nem traseira. Foi exatamente o
 * defeito do card antigo.
 *
 * `object-contain` sozinho tem o problema oposto: a mesma foto vertical deixa
 * duas faixas cinzas enormes dos lados, e a página passa a parecer quebrada.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A SAÍDA: FUNDO BORRADO DA PRÓPRIA FOTO + VEÍCULO INTEIRO POR CIMA
 * ════════════════════════════════════════════════════════════════════════════
 * Duas camadas da MESMA imagem na mesma moldura:
 *
 *   fundo  — `object-cover`, `blur`, escurecido. Preenche a moldura inteira e
 *            sempre nas cores da própria foto, então não existe faixa vazia;
 *   frente — `object-contain`. O veículo aparece INTEIRO, em qualquer proporção
 *            de origem, sem corte e sem deformação.
 *
 * Não custa request extra: o navegador busca a URL uma vez e serve as duas
 * camadas do mesmo recurso do cache.
 *
 * É a técnica que os classificados profissionais usam, e ela resolve o §12 sem
 * precisar adivinhar onde está o carro dentro do quadro — o que nenhuma conta de
 * CSS conseguiria fazer.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SEM BIBLIOTECA (§45)
 * ════════════════════════════════════════════════════════════════════════════
 * Estado é um índice inteiro; navegação é aritmética. Um carrossel de terceiros
 * traria peso, CSS próprio e um segundo sistema de foco para resolver o que
 * cabe em trinta linhas.
 *
 * `<img>` e não `next/image`: as URLs são absolutas do R2 e o projeto já servia
 * estas fotos assim. Trocar exigiria `remotePatterns` no `next.config` — mudança
 * global, fora do escopo de uma fase que redesenha uma tela.
 */

/** Quantas miniaturas aparecem antes de a faixa oferecer "+N". */
const VISIBLE_THUMBS = 8;

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

export default function OpportunityGallery({
  images,
  vehicleLabel,
}: {
  images: string[];
  /** "BYD Dolphin 2024" — vira o `alt` de cada foto, numerada. */
  vehicleLabel: string;
}) {
  const [active, setActive] = useState(0);
  const [expandedThumbs, setExpandedThumbs] = useState(false);
  const stripRef = useRef<HTMLUListElement | null>(null);

  const total = images.length;
  const index = total > 0 ? Math.min(active, total - 1) : 0;

  const go = useCallback(
    (delta: number) => {
      if (total <= 1) return;
      // Circular: da última para a primeira. Um limite duro deixaria as setas
      // desabilitadas nas pontas, e quem está comparando fotos ida e volta bate
      // numa parede a cada ciclo.
      setActive((current) => (current + delta + total) % total);
    },
    [total]
  );

  /**
   * A miniatura ativa entra em vista sozinha — MAS NUNCA NA MONTAGEM.
   *
   * ────────────────────────────────────────────────────────────────────────
   * O PULO DA PRIMEIRA RENDERIZAÇÃO É O CONSERTO DE UM BUG REAL
   * ────────────────────────────────────────────────────────────────────────
   * `scrollIntoView({ block: "nearest" })` rola o ANCESTRAL ROLÁVEL MAIS
   * PRÓXIMO — e quando a faixa de miniaturas está abaixo da dobra, esse
   * ancestral é a PÁGINA. Rodando na montagem, o efeito puxava a página uns
   * 40px para baixo assim que o detalhe carregava, e o "← Voltar para
   * oportunidades" nascia enfiado atrás do cabeçalho fixo.
   *
   * O sintoma não parecia rolagem nenhuma: parecia margem errada no topo. Foi a
   * captura de tela que o mostrou, e a medida (topo do link 61px contra rodapé
   * do cabeçalho 69px) que o provou — nenhum teste de componente veria isso,
   * porque jsdom não tem rolagem nem cabeçalho fixo.
   *
   * Depois da montagem o comportamento continua necessário: navegar pelas setas
   * com doze fotos deixaria a marcação azul fora da faixa visível, e aí a
   * galeria já está em vista — a rolagem que acontece é a horizontal, dentro da
   * própria faixa.
   *
   * ────────────────────────────────────────────────────────────────────────
   * POR QUE UM GUARDA DE VALOR, E NÃO UMA FLAG DE "JÁ MONTOU"
   * ────────────────────────────────────────────────────────────────────────
   * `useRef(false)` + "na primeira vez, retorne" NÃO funciona em
   * desenvolvimento: o StrictMode do React 18 monta, desmonta e remonta, então o
   * efeito roda DUAS vezes na carga. A primeira gasta a flag; a segunda passa
   * por ela e rola a página do mesmo jeito.
   *
   * Guardar o ÍNDICE resolve as duas execuções com a mesma regra: só rola quando
   * o índice de fato mudou. Duas execuções com o mesmo índice não rolam nenhuma
   * vez, e a primeira troca de foto rola normalmente.
   */
  const lastIndexRef = useRef(index);

  useEffect(() => {
    if (lastIndexRef.current === index) return;
    lastIndexRef.current = index;

    const strip = stripRef.current;
    if (!strip) return;
    const item = strip.querySelector<HTMLElement>(`[data-thumb-index="${index}"]`);
    // A checagem NÃO é paranoia: `scrollIntoView` não existe em jsdom, e sem ela
    // o efeito lança DENTRO da renderização — o componente inteiro morre e o
    // sintoma aparece como "não encontrei o campo de valor", trinta asserções
    // adiante, sem nenhuma menção a rolagem.
    if (typeof item?.scrollIntoView === "function") {
      item.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [index]);

  if (total === 0) {
    return (
      <div
        className="flex aspect-[16/10] w-full items-center justify-center rounded-2xl border border-dashed border-[#D6DEEB] bg-[#F7F9FC] text-[#98A2B3] sm:aspect-[16/9]"
        data-testid="dealer-detail-no-photos"
      >
        <span className="text-[13px] font-semibold">Sem fotos</span>
      </div>
    );
  }

  const current = images[index];
  const showAllThumbs = expandedThumbs || total <= VISIBLE_THUMBS;
  const thumbs = showAllThumbs ? images : images.slice(0, VISIBLE_THUMBS - 1);
  const hiddenCount = total - thumbs.length;

  return (
    <div data-testid="dealer-detail-gallery">
      {/*
        `role="group"` + `tabIndex` fazem a moldura receber foco e responder às
        setas do teclado (§11/§44). Sem `tabIndex` o `onKeyDown` nunca dispara:
        uma `div` não é foco natural, e o evento iria para o `body`.
      */}
      <div
        className="group relative overflow-hidden rounded-2xl bg-[#0B1526] outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#0e62d8]"
        role="group"
        aria-roledescription="galeria de fotos"
        aria-label={`Fotos de ${vehicleLabel}`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            go(-1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            go(1);
          }
        }}
      >
        <div className="relative aspect-[16/10] w-full sm:aspect-[16/9]">
          {/*
            CAMADA DE FUNDO. `aria-hidden` e `alt=""`: é a MESMA foto da frente,
            e anunciá-la duas vezes faria o leitor de tela ler cada veículo em
            duplicata.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current}
            alt={`${vehicleLabel} — foto ${index + 1} de ${total}`}
            className="absolute inset-0 h-full w-full object-contain"
            /* A foto principal é o maior elemento acima da dobra: carregá-la com
               prioridade é o que evita o quadro escuro de meio segundo. As
               miniaturas continuam preguiçosas. */
            fetchPriority="high"
            decoding="async"
            data-testid="dealer-detail-main-photo"
          />
        </div>

        <span
          className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1.5 text-[11.5px] font-semibold leading-none text-white backdrop-blur-sm"
          data-testid="dealer-detail-photo-counter"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
          {index + 1} / {total}
        </span>

        {total > 1 ? (
          <>
            {/*
              As setas ficam SEMPRE visíveis no toque e aparecem no hover no
              desktop. Escondê-las atrás do hover em telas sensíveis ao toque as
              tornaria inalcançáveis — não existe hover no dedo.
            */}
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Foto anterior"
              data-testid="dealer-detail-prev"
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#1D2440] shadow-md transition hover:bg-white focus-visible:ring-2 focus-visible:ring-[#0e62d8] lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Próxima foto"
              data-testid="dealer-detail-next"
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#1D2440] shadow-md transition hover:bg-white focus-visible:ring-2 focus-visible:ring-[#0e62d8] lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
            >
              <ChevronIcon direction="right" />
            </button>
          </>
        ) : null}
      </div>

      {total > 1 ? (
        /*
          FAIXA de rolagem horizontal, e não grade (§38). Miniaturas de largura
          FIXA: com doze fotos, uma grade de porcentagem espremeria cada quadro
          até o carro virar um borrão de 40px. Aqui a quantidade cresce para o
          lado e cada quadro continua legível.
        */
        <ul
          ref={stripRef}
          className="mt-2.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
          data-testid="dealer-detail-thumb-strip"
        >
          {thumbs.map((url, position) => (
            <li key={`${url}-${position}`} className="shrink-0" data-thumb-index={position}>
              <button
                type="button"
                onClick={() => setActive(position)}
                aria-label={`Ver foto ${position + 1} de ${total}`}
                aria-current={position === index}
                className={`block w-[78px] overflow-hidden rounded-lg border-2 bg-[#0B1526] transition focus-visible:ring-2 focus-visible:ring-[#0e62d8] sm:w-[92px] ${
                  position === index
                    ? "border-[#0e62d8]"
                    : "border-transparent opacity-70 hover:opacity-100"
                }`}
                data-testid="dealer-detail-thumb"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="aspect-[4/3] w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            </li>
          ))}

          {hiddenCount > 0 ? (
            <li className="shrink-0">
              {/*
                "+10" REVELA as fotos restantes — não é um selo decorativo. Um
                contador que não faz nada esconderia dez fotos atrás de um número
                e faria o lojista achar que a galeria acabou.
              */}
              <button
                type="button"
                onClick={() => setExpandedThumbs(true)}
                aria-label={`Mostrar as outras ${hiddenCount} fotos`}
                className="flex aspect-[4/3] w-[78px] items-center justify-center rounded-lg border-2 border-[#DBE7FB] bg-[#F0F6FF] text-[13px] font-bold text-[#0e62d8] transition hover:bg-[#E3EEFF] focus-visible:ring-2 focus-visible:ring-[#0e62d8] sm:w-[92px]"
                data-testid="dealer-detail-thumb-more"
              >
                +{hiddenCount}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
