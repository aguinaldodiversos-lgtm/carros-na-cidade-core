"use client";

import { useId } from "react";
import { BODY_TYPE_LABEL } from "@/lib/purchase-intents/api";

/**
 * A ILUSTRAÇÃO do card de comprador ativo.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTA TELA NÃO MOSTRA CARROS — MOSTRA PESSOAS PROCURANDO CARROS
 * ════════════════════════════════════════════════════════════════════════════
 * A distinção decide a arte inteira. Um card de "Compradores ativos" não é um
 * anúncio: não existe veículo do outro lado, não existe cor, ano, versão nem
 * estado de conservação. Existe um CRITÉRIO de busca.
 *
 * Por isso aqui não entra — e não pode entrar — fotografia. Uma foto de um Gol
 * 2020 vermelho no card de quem procura "Volkswagen Gol" comunicaria quatro
 * coisas falsas de uma vez: que aquele carro existe, que aquela cor é exigida,
 * que aquela geração é exigida e que a configuração é a procurada. O lojista
 * montaria a abordagem em cima de nenhuma dessas informações.
 *
 * A lupa é o assunto da figura. O carro atrás dela é a CATEGORIA, desenhada em
 * traço claramente ilustrativo — volume por gradiente, sem textura, sem placa,
 * sem logo de fabricante. Marca e modelo já estão escritos no título; a figura
 * não repete (nem contradiz) o texto.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE SVG INLINE
 * ════════════════════════════════════════════════════════════════════════════
 * Mesma decisão da Fase 4.11B (`OpportunityHubArt`), pelos mesmos motivos:
 * nitidez em qualquer densidade sem @2x, alguns KB dentro do próprio HTML —
 * zero request e zero layout shift por card — e cores vindas dos mesmos tokens
 * do resto da página.
 *
 * O peso importa mais aqui do que lá: o hub tem duas ilustrações, este grid tem
 * uma por card. Uma família de PNGs custaria uma request por card e um salto de
 * layout a cada imagem que chegasse fora de ordem.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * OS IDs DE GRADIENTE SÃO ÚNICOS POR INSTÂNCIA — NÃO POR ARQUIVO
 * ════════════════════════════════════════════════════════════════════════════
 * `id` em SVG é global ao DOCUMENTO. A 4.11B resolveu isso prefixando os ids
 * com o nome da ilustração, o que basta quando cada figura aparece UMA vez.
 *
 * Aqui não basta: vinte cards montam vinte cópias desta mesma figura na mesma
 * página, e um prefixo fixo produziria vinte `id="activeBuyerGlass"`. O
 * navegador resolve `url(#…)` pela PRIMEIRA ocorrência — todas as lupas passariam
 * a pintar com o gradiente da primeira, e o sintoma seria sutil (um degradê
 * levemente errado) sem um único aviso no console.
 *
 * `useId()` dá um sufixo estável entre servidor e cliente, então não há
 * divergência de hidratação. Os dois-pontos que o React usa no identificador
 * saem fora: `url(#:r3:-glass)` é legal em HTML, mas quebra qualquer seletor CSS
 * ou `querySelector` que venha a apontar para o gradiente.
 */

export const ART_BODY_TYPES = [
  "hatch",
  "sedan",
  "suv",
  "picape",
  "coupe",
  "minivan",
  "wagon",
  "generic",
] as const;

export type ArtBodyType = (typeof ART_BODY_TYPES)[number];

/**
 * A silhueta de cada carroceria, na tela de 320×112.
 *
 * `shell` é o contorno fechado do veículo; `glass` são os vidros; `wheels` são
 * os dois centros de roda — que variam, porque a distância entre eixos é parte
 * do que distingue um cupê de uma minivan.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A PROPORÇÃO DA TELA NÃO É ARBITRÁRIA
 * ────────────────────────────────────────────────────────────────────────────
 * 320×112 (≈2,9:1) é a proporção da FAIXA que o card reserva à figura. Uma tela
 * mais quadrada seria encaixada por ALTURA dentro dessa faixa (`preserveAspect
 * Ratio` faz "meet" por padrão), sobrando barras laterais vazias e encolhendo o
 * carro para pouco mais da metade da largura disponível — foi exatamente o que
 * aconteceu na primeira versão desta figura.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE PRECISA SER DISTINTO, E O QUE PRECISA SER IGUAL
 * ────────────────────────────────────────────────────────────────────────────
 * IGUAL: a linha do chão (y=94) e a espessura do traço. Um SUV que subisse o
 * chão pareceria flutuar ao lado de um sedã na mesma linha do grid.
 *
 * DISTINTO: altura do teto, comprimento do teto, inclinação da traseira e
 * distância entre eixos — que é como uma pessoa distingue as carrocerias de
 * relance. A ~310px de largura (o tamanho real no grid a 1440), a diferença
 * entre um teto a y=20 e outro a y=34 é visível; a diferença entre dois faróis
 * desenhados não é. Por isso não há faróis, maçanetas nem retrovisores: detalhe
 * que some no tamanho de uso só acrescenta peso ao SVG.
 */
const SILHOUETTE: Record<
  ArtBodyType,
  { shell: string; glass: string; wheels: [number, number]; label: string }
> = {
  // Teto curto, traseira caída e balanço traseiro CURTO — o carro "acaba" logo
  // depois da roda.
  hatch: {
    shell:
      "M18 94C18 78 24 70 40 66L82 56L106 30C109 27 113 25 118 25H172C178 25 182 27 185 32L204 62L226 67C238 70 244 77 244 86V94Z",
    glass: "M112 33H144V57H96ZM152 33H172C175 33 177 34 179 37L195 57H152Z",
    wheels: [70, 200],
    label: "hatch",
  },
  // Três volumes: o porta-malas é um degrau horizontal depois do vidro traseiro.
  sedan: {
    shell:
      "M16 94C16 78 22 70 38 66L80 57L104 32C107 29 111 27 116 27H178C184 27 188 29 191 34L210 60L258 67C270 69 276 76 276 86V94Z",
    glass: "M110 35H143V58H94ZM151 35H176C179 35 181 36 183 39L200 58H151Z",
    wheels: [68, 214],
    label: "sedan",
  },
  // Alto e quadrado: teto a y=18, carroceria mais alta e traseira quase
  // vertical.
  suv: {
    shell:
      "M16 94C16 74 22 65 38 61L74 52L94 22C97 18 102 16 108 16H196C203 16 208 19 211 25L226 52L252 59C266 62 272 70 272 82V94Z",
    glass: "M100 26H140V54H82ZM148 26H190C193 26 195 27 197 30L212 54H148Z",
    wheels: [70, 214],
    label: "suv",
  },
  // Cabine curta seguida de CAÇAMBA aberta — a parede da caçamba é o traço que
  // identifica a picape de relance.
  picape: {
    shell:
      "M16 94C16 74 22 65 38 61L72 52L92 22C95 18 100 16 106 16H158C165 16 170 19 173 25L188 52V56H268C275 56 280 61 280 68V94Z",
    glass: "M98 26H136V54H80ZM144 26H154C157 26 159 27 161 30L174 54H144Z",
    wheels: [70, 224],
    label: "picape",
  },
  // Baixo e comprido, com a traseira em fastback: o teto desce direto até a
  // ponta, sem degrau de porta-malas.
  coupe: {
    shell:
      "M14 94C14 80 20 72 36 68L84 58L118 34C123 30 129 28 136 28H172C179 28 184 31 187 37L200 60L262 72C274 75 280 82 280 92V94Z",
    glass: "M124 37H152V59H106ZM160 37H172C175 37 177 38 179 41L190 59H160Z",
    wheels: [72, 220],
    label: "coupe",
  },
  // Monovolume: teto altíssimo e LONGO, nariz curto e inclinado, sem capô
  // horizontal.
  minivan: {
    shell:
      "M16 94C16 72 22 62 38 57L66 48L88 20C91 15 96 12 103 12H196C205 12 211 17 213 26L226 57C244 61 252 69 252 82V94Z",
    glass: "M96 22H140V50H78ZM148 22H192C195 22 197 24 198 27L205 50H148Z",
    wheels: [70, 206],
    label: "minivan",
  },
  // Perua: o teto do sedã ESTICADO até a traseira, que desce quase reta.
  wagon: {
    shell:
      "M16 94C16 76 22 67 38 63L78 54L100 26C103 22 108 20 113 20H214C221 20 226 23 229 29L240 54C256 57 264 65 264 78V94Z",
    glass: "M106 30H142V56H90ZM150 30H210C213 30 215 31 216 34L224 56H150Z",
    wheels: [68, 212],
    label: "wagon",
  },
  // Proporção neutra, entre o hatch e o sedã. É a figura do modo "compra
  // específica", que não declara carroceria nenhuma.
  generic: {
    shell:
      "M16 94C16 78 22 70 38 66L80 56L105 31C108 28 112 26 117 26H176C182 26 186 28 189 33L208 61L242 67C254 69 260 76 260 86V94Z",
    glass: "M111 34H144V57H95ZM152 34H174C177 34 179 35 181 38L198 57H152Z",
    wheels: [70, 206],
    label: "veículo",
  },
};

function isArtBodyType(value: string): value is ArtBodyType {
  return (ART_BODY_TYPES as readonly string[]).includes(value);
}

/**
 * Carroceria desconhecida cai no genérico em vez de sumir.
 *
 * O vocabulário de carroceria pode crescer no banco antes de crescer aqui (o
 * CHECK vem de `ads.canonical.constants.js`, compartilhado com os anúncios). Um
 * valor novo não pode deixar o card sem figura — a altura mudaria e a linha do
 * grid ficaria torta.
 */
export function resolveArtBodyType(value: string | null | undefined): ArtBodyType {
  const slug = String(value ?? "").trim();
  return isArtBodyType(slug) ? slug : "generic";
}

export default function ActiveBuyerArt({
  bodyType,
  className = "",
}: {
  bodyType: string | null | undefined;
  className?: string;
}) {
  const resolved = resolveArtBodyType(bodyType);
  const silhouette = SILHOUETTE[resolved];

  // Sem os dois-pontos do React: `url(#…)` funciona com eles, mas
  // `querySelector` e qualquer CSS que aponte para o gradiente não.
  const uid = useId().replace(/:/g, "");
  const id = (suffix: string) => `${uid}-${suffix}`;

  /*
    O texto alternativo é o CONTRATO da figura com quem não a vê — e com quem a
    vê e pode interpretá-la errado.

    "Ilustração da categoria do veículo procurado" diz as duas coisas que
    importam: que é ilustração (não um carro à venda) e que representa a
    CATEGORIA, não um exemplar. Um `alt` do tipo "Volkswagen Gol branco" faria
    por áudio exatamente o que a fotografia faria por imagem.

    A figura NÃO é `aria-hidden` como as do hub 4.11B: lá o texto ao lado dizia
    tudo o que a imagem dizia, aqui ela acrescenta a ressalva de que o desenho é
    ilustrativo — e essa ressalva não está escrita em lugar nenhum do card.
  */
  const description =
    resolved === "generic"
      ? "Ilustração da categoria do veículo procurado"
      : `Ilustração da categoria do veículo procurado: ${
          BODY_TYPE_LABEL[resolved] || silhouette.label
        }`;

  return (
    <svg
      viewBox="0 0 320 112"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={description}
      data-testid="active-buyer-art"
      data-body-type={resolved}
    >
      <title>{description}</title>

      <defs>
        <linearGradient id={id("backdrop")} x1="40" y1="8" x2="280" y2="104" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E7F0FF" />
          <stop offset="1" stopColor="#F7FAFF" />
        </linearGradient>
        {/*
          O VOLUME DA LATARIA VEM DAQUI, E PRECISA DE AMPLITUDE

          A primeira versão ia de #FFFFFF a #D5E0F0 — 8% de luminância entre o
          teto e a soleira. A essa amplitude a carroceria vira uma silhueta
          chapada quase branca, e a coisa mais escura da figura passa a ser o
          pneu: no grid, nove cards lidos de relance viram nove pares de
          argolas pretas, e as carrocerias (que É o que distingue um card do
          outro) deixam de ser o assunto.

          A rampa agora fecha em #B3C8E3 e concentra a virada na metade de
          baixo — que é onde a luz de fato cai numa lataria. O teto continua
          branco: o contraste é interno à figura, não um escurecimento geral.
        */}
        <linearGradient id={id("shell")} x1="60" y1="16" x2="220" y2="94" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.42" stopColor="#EDF3FB" />
          <stop offset="0.72" stopColor="#D3E0F1" />
          <stop offset="1" stopColor="#B3C8E3" />
        </linearGradient>
        <linearGradient id={id("glass")} x1="90" y1="14" x2="220" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C6DCF7" />
          <stop offset="1" stopColor="#9DC0EA" />
        </linearGradient>
        <linearGradient id={id("lens")} x1="240" y1="8" x2="296" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="1" stopColor="#CFE2FF" stopOpacity="0.68" />
        </linearGradient>
        <linearGradient id={id("ring")} x1="238" y1="6" x2="302" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4C93F2" />
          <stop offset="1" stopColor="#0E4FB8" />
        </linearGradient>
        <radialGradient
          id={id("ground")}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(150 96) scale(132 12)"
        >
          <stop stopColor="#1D3E76" stopOpacity="0.18" />
          <stop offset="1" stopColor="#1D3E76" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* A "mancha" de fundo — a mesma linguagem do hub da 4.11B. */}
      <path
        d="M30 34C42 12 82 2 132 4c50 2 92 14 118 32 26 18 22 48-6 60-28 12-84 18-136 14C56 106 20 92 14 72 8 52 18 56 30 34Z"
        fill={`url(#${id("backdrop")})`}
      />

      {/* Sombra no chão: o apoio que impede o carro de parecer flutuando. */}
      <ellipse cx="150" cy="96" rx="128" ry="10" fill={`url(#${id("ground")})`} />

      <path d={silhouette.shell} fill={`url(#${id("shell")})`} />
      <path
        d={silhouette.shell}
        stroke="#8FAAD0"
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d={silhouette.glass} fill={`url(#${id("glass")})`} />

      {/*
        Rodas. Aro claro dentro do pneu escuro — volume sem textura.

        Os centros vêm da silhueta: a distância entre eixos faz parte do que
        distingue as carrocerias, e rodas em posição fixa colocariam a roda
        traseira da minivan no meio da carroceria.
      */}
      <g>
        {silhouette.wheels.map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="92" r="13" fill="#2B3D5C" />
            {/*
              Aro em DOIS passos, não um furo branco.

              Pneu escuro + miolo quase branco (r=6 em r=14) desenhava uma
              argola: a área clara era pequena demais para ler como aro e
              grande demais para ler como cubo, então o olho via um anel
              preto. Com o aro de #C8D8EC ocupando r=7,5 e o cubo por cima, a
              roda tem a mesma leitura da referência — pneu, aro, centro — sem
              nenhuma textura.
            */}
            <circle cx={cx} cy="92" r="7.5" fill="#C8D8EC" />
            <circle cx={cx} cy="92" r="3" fill="#6E86A8" />
          </g>
        ))}
      </g>

      {/* A LUPA — o assunto da figura, e o que a marca como "procura". */}
      <g>
        <circle cx="268" cy="36" r="26" fill={`url(#${id("lens")})`} />
        <circle cx="268" cy="36" r="26" stroke={`url(#${id("ring")})`} strokeWidth="6" />
        <path
          d="M287 55l14 14"
          stroke={`url(#${id("ring")})`}
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* Brilho: um arco claro no quadrante superior esquerdo do vidro. */}
        <path
          d="M254 25a19 19 0 0 1 11-7"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.9"
        />
      </g>
    </svg>
  );
}
