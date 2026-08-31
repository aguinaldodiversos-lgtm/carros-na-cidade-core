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
 * ════════════════════════════════════════════════════════════════════════════
 * O CARRO É O ASSUNTO. A LUPA É UM ADJETIVO.
 * ════════════════════════════════════════════════════════════════════════════
 * A primeira versão desta figura invertia isso: uma lupa de raio 26 (metade da
 * altura útil) sobreposta a uma silhueta chapada. O olho batia na lupa, não no
 * veículo — e o que o lojista precisa reconhecer em meio segundo é a
 * CARROCERIA, porque é ela que diz se aquela procura casa com o pátio dele.
 *
 * Agora a lupa é um selo pequeno no canto superior direito: presente para
 * marcar "isto é uma procura", pequena o bastante para não competir. O carro
 * ocupa a faixa inteira.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE FAZ UM DESENHO PARECER UM CARRO
 * ════════════════════════════════════════════════════════════════════════════
 * Não é quantidade de detalhe — é ONDE o detalhe está. A versão anterior era
 * uma silhueta fechada de fundo plano com duas rodas apoiadas por baixo, que é
 * a construção de um ícone, não de um veículo. Quatro coisas mudam a leitura:
 *
 *  1. CAIXA DE RODA. O corpo é recortado por um arco acima de cada roda. Sem
 *     ele o carro parece um adesivo pousado sobre dois círculos; com ele a roda
 *     entra na lataria, que é como todo carro real se parece.
 *  2. RODA COM ARO E RAIOS. Pneu escuro, aro claro, raios e cubo. Um disco com
 *     um furo no meio lê como argola; quatro camadas leem como roda.
 *  3. VIDRO MAIS ESCURO QUE A LATARIA. Vidro claro sobre lataria clara vira uma
 *     mancha só. A inversão de valor é o que separa a cabine do corpo.
 *  4. FARÓIS E LANTERNAS. Duas manchas minúsculas — uma fria na frente, uma
 *     quente atrás — dão frente e traseira ao veículo. Sem elas o desenho é
 *     simétrico e ambíguo, e o olho não sabe para onde o carro aponta.
 *
 * O DESENHO CONTINUA SENDO DESENHO: gradiente e traço, sem textura, sem placa,
 * sem logo de fabricante, sem reflexo fotográfico. Marca e modelo já estão
 * escritos no título; a figura não repete nem contradiz o texto.
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
 * layout a cada imagem que chegasse fora de ordem — e um acervo de fotos por
 * modelo seria impossível de manter honesto (ver o bloco de cima).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A METADE DE BAIXO É COMPARTILHADA DE PROPÓSITO
 * ════════════════════════════════════════════════════════════════════════════
 * Chão, altura de soleira, caixas de roda e desenho da roda saem de código
 * comum; só o PERFIL SUPERIOR é próprio de cada carroceria. É o que mantém as
 * oito figuras na mesma família visual — um SUV que subisse o chão pareceria
 * flutuar ao lado de um sedã na mesma linha do grid — enquanto a diferença
 * entre elas fica exatamente onde uma pessoa procura: teto, caimento da
 * traseira e distância entre eixos.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * OS IDs DE GRADIENTE SÃO ÚNICOS POR INSTÂNCIA — NÃO POR ARQUIVO
 * ════════════════════════════════════════════════════════════════════════════
 * `id` em SVG é global ao DOCUMENTO. A 4.11B resolveu isso prefixando os ids
 * com o nome da ilustração, o que basta quando cada figura aparece UMA vez.
 *
 * Aqui não basta: vinte cards montam vinte cópias desta mesma figura na mesma
 * página, e um prefixo fixo produziria vinte `id="activeBuyerGlass"`. O
 * navegador resolve `url(#…)` pela PRIMEIRA ocorrência — todas as latarias
 * passariam a pintar com o gradiente da primeira, e o sintoma seria sutil (um
 * degradê levemente errado) sem um único aviso no console.
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
 * A tela é 320×132 e o CHÃO é y=114 para todas as carrocerias.
 *
 * A proporção (≈2,42:1) é a da faixa que o card reserva à figura — o esqueleto
 * de carregamento repete o mesmo `aspect-[320/132]`. Uma tela mais quadrada
 * seria encaixada por ALTURA dentro da faixa (`preserveAspectRatio` faz "meet"
 * por padrão), sobrando barras laterais vazias e encolhendo o carro; foi
 * exatamente o que aconteceu na primeira versão desta figura.
 */
const GROUND = 114;

type Silhouette = {
  /** Perfil superior: de (frontX, bottom) por cima do carro até (rearX, bottom). */
  upper: string;
  frontX: number;
  rearX: number;
  /** Linha da soleira. SUV e picape a levantam — é o vão livre deles. */
  bottom: number;
  /** Centros de roda em x. A distância entre eixos distingue as carrocerias. */
  wheels: [number, number];
  wheelR: number;
  /** Raio da caixa de roda. Sempre > wheelR, senão o arco corta o pneu. */
  archR: number;
  glass: string;
  /** Recorte de porta. Cupê não tem: porta única e longa. */
  doorLine: string;
  headlight: string;
  taillight: string;
  handles: Array<[number, number]>;
  label: string;
};

/*
 * ════════════════════════════════════════════════════════════════════════════
 * PROPORÇÃO MODERNA, DIFERENÇA EXAGERADA
 * ════════════════════════════════════════════════════════════════════════════
 * Duas regras valem para as oito carrocerias, e vieram de dois defeitos reais:
 *
 *  • BALANÇO DIANTEIRO ≈ 30% DA DISTÂNCIA ENTRE EIXOS. A ~40% o nariz avança
 *    demais à frente da roda e o carro escorre para a frente — foi o que fez a
 *    primeira versão com caixa de roda sair com cara de sedã dos anos 80. Roda
 *    perto da quina é a assinatura de carro contemporâneo.
 *  • CABINE ALTA E ADIANTADA. O para-brisa começa logo atrás da roda dianteira.
 *    Cabine baixa e recuada sobre capô comprido é a proporção que lê como carro
 *    velho, por melhor que seja o traço.
 *
 * E uma terceira que contraria o instinto de fidelidade:
 *
 *  • A DIFERENÇA ENTRE CARROCERIAS É EXAGERADA DE PROPÓSITO. Medida fiel não
 *    sobrevive ao tamanho de uso. Num card de ~310px o SUV real é ~12% mais
 *    alto que o hatch, e 12% de 130px de tela some: a versão anterior desenhava
 *    as oito silhuetas corretamente e mesmo assim hatch, sedã e SUV liam igual
 *    na grade — só a picape se destacava. Aqui o SUV ganha teto muito mais
 *    alto, roda maior e soleira levantada; o hatch encurta de verdade; o sedã
 *    estica a traseira. É caricatura controlada, e é o que faz a triagem de
 *    meio segundo funcionar.
 *
 * O que NÃO varia: a linha do chão (y=114) e a espessura do traço. Um SUV que
 * subisse o chão pareceria flutuar ao lado de um sedã na mesma linha do grid.
 */
const SILHOUETTE: Record<ArtBodyType, Silhouette> = {
  // CURTO. Comprimento total ~224 contra ~270 do sedã: o hatch tem de PARECER
  // menor, não só ter a traseira diferente. Tampa quase vertical logo depois
  // da roda traseira.
  hatch: {
    upper:
      "C41 91 42 82 49 78L62 73C72 69 84 66 100 64L114 63L138 37C141 35 145 34 150 34L202 34C208 34 212 36 215 41L236 62L250 67C260 71 266 78 267 88L268 100",
    frontX: 44,
    rearX: 268,
    bottom: 100,
    wheels: [90, 230],
    wheelR: 19,
    archR: 25,
    glass:
      "M122 62L140 40C142 39 145 39 148 39L168 39L168 62ZM175 39L200 39C205 39 208 40 210 44L224 62L175 62Z",
    doorLine: "M171 63L171 92",
    headlight: "M50 78L66 72L69 79L53 83Z",
    taillight: "M258 72L266 75L266 88L258 86Z",
    handles: [
      [154, 69],
      [196, 69],
    ],
    label: "hatch",
  },

  // TRÊS VOLUMES E COMPRIDO. O degrau horizontal da tampa do porta-malas, mais
  // o balanço traseiro esticado, é o que separa o sedã do hatch de relance.
  sedan: {
    upper:
      "C23 91 24 82 31 78L46 72C58 68 72 65 90 63L104 62L126 35C129 33 133 32 138 32L200 32C206 32 210 34 213 39L234 60L282 63C292 65 295 72 296 82L296 100",
    frontX: 26,
    rearX: 296,
    bottom: 100,
    wheels: [80, 238],
    wheelR: 19,
    archR: 25,
    glass:
      "M112 60L129 38C131 37 134 37 137 37L164 37L164 60ZM171 37L198 37C203 37 206 38 208 42L221 60L171 60Z",
    doorLine: "M168 61L168 92",
    headlight: "M32 78L50 72L53 79L35 83Z",
    taillight: "M285 70L294 73L294 86L285 84Z",
    handles: [
      [148, 67],
      [194, 67],
    ],
    label: "sedã",
  },

  // ALTO DE VERDADE. Teto a y=16 contra 34 do hatch, roda de raio 25 contra 19
  // e soleira levantada para 94. São os três juntos — e não só o teto — que
  // separam o SUV do sedã no tamanho do card.
  suv: {
    upper:
      "C27 78 28 64 35 60L50 53C62 48 76 44 94 41L108 39L122 19C125 17 129 16 134 16L218 16C225 16 229 18 232 23L246 41L266 46C280 49 285 58 286 68L286 94",
    frontX: 30,
    rearX: 286,
    bottom: 94,
    wheels: [84, 240],
    wheelR: 25,
    archR: 32,
    glass:
      "M110 42L124 22C126 21 129 21 132 21L162 21L162 42ZM169 21L214 21C219 21 222 22 224 26L236 42L169 42Z",
    doorLine: "M166 43L166 84",
    headlight: "M36 60L54 54L57 61L39 65Z",
    taillight: "M275 54L284 57L284 74L275 72Z",
    handles: [
      [146, 49],
      [196, 49],
    ],
    label: "SUV",
  },

  // Cabine curta e CAÇAMBA aberta. A parede da caçamba — o degrau horizontal
  // longo atrás da cabine — identifica a picape à distância, e foi a única
  // carroceria que já se distinguia antes deste exagero.
  picape: {
    upper:
      "C21 78 22 64 29 60L44 53C56 48 70 44 88 41L102 39L118 21C121 19 125 18 130 18L176 18C182 18 186 20 188 25L194 41L196 50L292 50C296 50 298 53 298 57L298 94",
    frontX: 24,
    rearX: 298,
    bottom: 94,
    wheels: [80, 246],
    wheelR: 25,
    archR: 32,
    glass:
      "M106 42L120 23C122 22 125 22 128 22L156 22L156 42ZM163 22L174 22C179 22 182 23 184 27L189 42L163 42Z",
    doorLine: "M160 23L160 84",
    headlight: "M30 60L48 54L51 61L33 65Z",
    taillight: "M288 56L297 58L297 72L288 70Z",
    handles: [[144, 49]],
    label: "picape",
  },

  // Baixo e comprido, teto recuado e traseira em fastback: o teto desce direto
  // até o para-choque, sem degrau de porta-malas.
  coupe: {
    upper:
      "C25 91 26 82 33 78L50 71C64 66 82 63 104 61L128 59L152 41C156 39 160 38 166 38L192 38C198 38 202 40 205 45L232 64L266 70C282 73 292 80 293 90L294 100",
    frontX: 28,
    rearX: 294,
    bottom: 100,
    wheels: [84, 244],
    wheelR: 19,
    archR: 25,
    glass:
      "M134 61L154 44C156 43 159 43 162 43L178 43L178 61ZM184 43L190 43C195 43 198 44 200 47L214 61L184 61Z",
    doorLine: "",
    headlight: "M34 78L54 71L57 78L37 83Z",
    taillight: "M282 72L292 75L292 89L282 87Z",
    handles: [[172, 69]],
    label: "cupê",
  },

  // Monovolume: teto altíssimo e LONGO, nariz curto e muito inclinado — não há
  // capô horizontal, o para-brisa começa quase no para-choque.
  minivan: {
    upper:
      "C23 80 24 66 32 62L46 55C56 50 64 44 76 36L94 20C98 17 103 16 110 16L230 16C238 16 242 19 244 26L252 54L268 58C282 61 287 68 288 78L288 96",
    frontX: 26,
    rearX: 288,
    bottom: 96,
    wheels: [82, 240],
    wheelR: 21,
    archR: 27,
    glass:
      "M98 46L110 21C112 20 115 20 118 20L142 20L142 46ZM149 20L228 20C233 20 236 21 237 25L243 46L149 46Z",
    doorLine: "M146 48L146 86",
    headlight: "M32 62L50 55L53 62L35 67Z",
    taillight: "M277 58L286 61L286 78L277 76Z",
    handles: [
      [130, 54],
      [196, 54],
    ],
    label: "minivan",
  },

  // Perua: o teto do sedã ESTICADO até a traseira, que desce quase reta. É o
  // oposto do hatch — mesmo nariz, mas o teto não acaba.
  wagon: {
    upper:
      "C23 91 24 82 31 78L46 72C58 68 72 65 90 63L104 62L126 34C129 32 133 31 138 31L246 31C253 31 257 33 259 38L264 60L274 63C284 66 291 72 292 82L292 100",
    frontX: 26,
    rearX: 292,
    bottom: 100,
    wheels: [80, 242],
    wheelR: 19,
    archR: 25,
    glass:
      "M112 60L129 37C131 36 134 36 137 36L164 36L164 60ZM171 36L242 36C247 36 250 37 251 41L255 60L171 60Z",
    doorLine: "M168 61L168 92",
    headlight: "M32 78L50 72L53 79L35 83Z",
    taillight: "M280 62L290 65L290 82L280 80Z",
    handles: [
      [148, 67],
      [198, 67],
    ],
    label: "perua",
  },

  // Proporção neutra, entre o hatch e o sedã. É a figura de quem não declarou
  // carroceria E cujo modelo não foi reconhecido — por isso não pode puxar para
  // nenhum extremo: precisa estar certa o bastante para qualquer carro.
  generic: {
    upper:
      "C31 91 32 82 39 78L54 72C66 68 78 65 96 63L110 62L132 36C135 34 139 33 144 33L202 33C208 33 212 35 215 40L237 61L256 66C268 70 276 77 277 87L282 100",
    frontX: 34,
    rearX: 282,
    bottom: 100,
    wheels: [84, 236],
    wheelR: 19,
    archR: 25,
    glass:
      "M118 61L134 39C136 38 139 38 142 38L166 38L166 61ZM173 38L200 38C205 38 208 39 210 43L225 61L173 61Z",
    doorLine: "M169 62L169 92",
    headlight: "M40 78L58 72L61 79L43 83Z",
    taillight: "M270 71L279 74L279 88L270 86Z",
    handles: [
      [152, 68],
      [196, 68],
    ],
    label: "veículo",
  },
};

/**
 * Fecha a silhueta: perfil superior + soleira recortada pelas caixas de roda.
 *
 * A soleira é percorrida da traseira para a frente, e em cada roda o traço sobe
 * num semicírculo. `sweep-flag = 0` porque, indo da direita para a esquerda por
 * CIMA do círculo (3h → 12h → 9h), o arco corre no sentido anti-horário na
 * tela; com `1` o arco desceria e o recorte viraria uma barriga.
 */
function shellPath(s: Silhouette): string {
  const [front, rear] = s.wheels;
  return [
    `M${s.frontX} ${s.bottom}`,
    s.upper,
    `L${rear + s.archR} ${s.bottom}`,
    `A${s.archR} ${s.archR} 0 0 0 ${rear - s.archR} ${s.bottom}`,
    `L${front + s.archR} ${s.bottom}`,
    `A${s.archR} ${s.archR} 0 0 0 ${front - s.archR} ${s.bottom}`,
    "Z",
  ].join("");
}

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

/** Cinco raios. Menos que isso lê como hélice; mais, como disco cheio. */
const SPOKES = [0, 72, 144, 216, 288];

export default function ActiveBuyerArt({
  bodyType,
  className = "",
}: {
  bodyType: string | null | undefined;
  className?: string;
}) {
  const resolved = resolveArtBodyType(bodyType);
  const s = SILHOUETTE[resolved];
  const wheelCy = GROUND - s.wheelR;

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
          BODY_TYPE_LABEL[resolved] || s.label
        }`;

  return (
    <svg
      viewBox="0 0 320 132"
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
        <linearGradient id={id("backdrop")} x1="40" y1="6" x2="280" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAF2FD" />
          <stop offset="1" stopColor="#F8FBFF" />
        </linearGradient>

        {/*
          A LATARIA. Vertical, do teto à soleira — é assim que a luz cai num
          carro, e é o que dá volume sem precisar de nenhum reflexo desenhado.
          A amplitude é grande de propósito: uma rampa curta (branco → cinza
          clarinho) achata a lataria e faz o PNEU virar a coisa mais escura da
          figura, que foi o defeito da versão anterior.
        */}
        <linearGradient id={id("body")} x1="0" y1="24" x2="0" y2="104" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.34" stopColor="#F3F8FD" />
          <stop offset="0.72" stopColor="#D8E5F4" />
          <stop offset="1" stopColor="#AFC5E0" />
        </linearGradient>

        {/*
          O VIDRO É MAIS ESCURO QUE A LATARIA — de propósito.

          Vidro claro sobre lataria clara vira uma mancha só, e a cabine
          desaparece. A inversão de valor é o que separa greenhouse de corpo em
          qualquer ilustração automotiva.
        */}
        <linearGradient id={id("glass")} x1="110" y1="24" x2="240" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9DBEE2" />
          <stop offset="1" stopColor="#6E93C4" />
        </linearGradient>

        <linearGradient id={id("tire")} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="#3A465C" />
          <stop offset="1" stopColor="#1B2432" />
        </linearGradient>

        <linearGradient id={id("rim")} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="#F2F6FB" />
          <stop offset="1" stopColor="#C6D5E7" />
        </linearGradient>

        <linearGradient id={id("lamp")} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#B9D8F5" />
        </linearGradient>

        <linearGradient id={id("tail")} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
          <stop stopColor="#F0A6A2" />
          <stop offset="1" stopColor="#D2635E" />
        </linearGradient>

        <radialGradient
          id={id("ground")}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform={`translate(158 ${GROUND + 2}) scale(126 9)`}
        >
          <stop stopColor="#1D3E76" stopOpacity="0.22" />
          <stop offset="1" stopColor="#1D3E76" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* A "mancha" de fundo — a mesma linguagem do hub da 4.11B. */}
      <path
        d="M32 36C46 12 88 2 140 4c52 2 96 14 122 32 26 18 22 52-8 66-30 14-88 20-142 16C60 114 22 98 16 76 10 54 18 60 32 36Z"
        fill={`url(#${id("backdrop")})`}
      />

      {/* Sombra de contato: o apoio que impede o carro de parecer flutuando. */}
      <ellipse cx="158" cy={GROUND + 2} rx="126" ry="9" fill={`url(#${id("ground")})`} />

      {/*
        RODAS ANTES DA LATARIA.

        Pintadas primeiro, elas ficam ATRÁS do corpo: a caixa de roda recorta o
        topo do pneu e a roda entra na lataria, em vez de ficar pousada por
        baixo dela como um adesivo.
      */}
      {s.wheels.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={wheelCy} r={s.wheelR} fill={`url(#${id("tire")})`} />
          <circle cx={cx} cy={wheelCy} r={s.wheelR * 0.6} fill={`url(#${id("rim")})`} />
          {SPOKES.map((deg) => {
            const rad = (deg * Math.PI) / 180;
            return (
              <line
                key={deg}
                x1={cx}
                y1={wheelCy}
                x2={cx + Math.cos(rad) * s.wheelR * 0.52}
                y2={wheelCy + Math.sin(rad) * s.wheelR * 0.52}
                stroke="#A9BDD6"
                strokeWidth="2"
                strokeLinecap="round"
              />
            );
          })}
          <circle cx={cx} cy={wheelCy} r={s.wheelR * 0.17} fill="#7E93AE" />
        </g>
      ))}

      {/* Lataria. */}
      <path d={shellPath(s)} fill={`url(#${id("body")})`} />

      {/* Lanternas e faróis por baixo do contorno, para o traço fechar por cima. */}
      <path d={s.headlight} fill={`url(#${id("lamp")})`} />
      <path d={s.taillight} fill={`url(#${id("tail")})`} />

      <path
        d={shellPath(s)}
        stroke="#7F9BC0"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      <path d={s.glass} fill={`url(#${id("glass")})`} fillRule="evenodd" />

      {/* Recorte de porta e maçanetas: escala, sem virar detalhe barulhento. */}
      {s.doorLine ? (
        <path d={s.doorLine} stroke="#A9BFDA" strokeWidth="1.6" strokeLinecap="round" />
      ) : null}
      {s.handles.map(([hx, hy]) => (
        <rect key={`${hx}-${hy}`} x={hx} y={hy} width="11" height="3" rx="1.5" fill="#9DB4D2" />
      ))}

      {/*
        A LUPA — pequena, no canto, fora do caminho do carro.

        Ela marca "isto é uma procura, não um anúncio". Grande, roubava o card:
        o lojista precisa reconhecer a CARROCERIA em meio segundo, e nada pode
        competir com ela nessa faixa.
      */}
      <g opacity="0.9">
        <circle cx="291" cy="21" r="9.5" stroke="#2F6FD0" strokeWidth="3" fill="#FFFFFF" fillOpacity="0.55" />
        <path d="M298 28l7 7" stroke="#2F6FD0" strokeWidth="3.4" strokeLinecap="round" />
      </g>
    </svg>
  );
}
