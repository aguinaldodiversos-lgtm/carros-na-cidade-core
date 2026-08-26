/**
 * As duas ILUSTRAÇÕES do hub de oportunidades.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE SVG INLINE, E NÃO PNG
 * ════════════════════════════════════════════════════════════════════════════
 * A referência visual desta tela usa figuras em estilo "3D suave" — volume por
 * gradiente, cantos muito arredondados, sombra difusa. Isso é reproduzível em
 * SVG com `linearGradient` e `radialGradient`, e SVG traz o que um PNG não traz:
 *
 *   • nitidez em qualquer densidade de tela, sem @2x/@3x;
 *   • peso de alguns KB dentro do próprio HTML — zero request, zero layout
 *     shift esperando a imagem chegar;
 *   • as cores saem dos MESMOS tokens do resto da página. Um PNG congelaria a
 *     paleta e divergiria no dia em que o azul da marca mudasse.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * OS IDs DE GRADIENTE SÃO PREFIXADOS POR ILUSTRAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 * `id` em SVG é global ao DOCUMENTO, não ao `<svg>`. Duas ilustrações na mesma
 * página com um `id="grad"` cada uma fazem a segunda pintar com o gradiente da
 * primeira — e o sintoma é o carro verde saindo azul, sem erro nenhum no
 * console. Por isso todo id aqui carrega o prefixo do próprio bloco.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AS DUAS FALAM CORES DIFERENTES DE PROPÓSITO
 * ════════════════════════════════════════════════════════════════════════════
 * Azul = COMPRADORES ATIVOS (vender do meu estoque).
 * Verde-água = VEÍCULOS PARA AVALIAÇÃO (comprar para repor estoque).
 *
 * A cor é o atalho que faz o lojista distinguir os dois caminhos antes de ler o
 * título — e é por isso que ela não pode ser decorativa nem trocar de lado. Como
 * cor sozinha não é acessível, cada cartão repete a distinção no título, no
 * texto e no ícone.
 *
 * `aria-hidden`: são ornamentos. Tudo o que elas comunicam está escrito ao lado,
 * e anunciá-las faria o leitor de tela ler duas vezes a mesma coisa.
 */

/** Compradores ativos — pessoas procurando, lupa e ficha de busca. */
export function BuyersArt({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 230"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="buyersArtBlob" x1="40" y1="20" x2="280" y2="215" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E8F1FF" />
          <stop offset="1" stopColor="#F5F9FF" />
        </linearGradient>
        <linearGradient id="buyersArtDeep" x1="120" y1="40" x2="230" y2="180" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B8DF0" />
          <stop offset="1" stopColor="#0F4DB6" />
        </linearGradient>
        <linearGradient id="buyersArtMid" x1="60" y1="70" x2="150" y2="200" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7FB4F7" />
          <stop offset="1" stopColor="#2C7BE5" />
        </linearGradient>
        <linearGradient id="buyersArtGlass" x1="150" y1="60" x2="250" y2="170" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="1" stopColor="#D6E7FF" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="buyersArtCard" x1="150" y1="30" x2="290" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#EEF4FF" />
        </linearGradient>
      </defs>

      {/* Fundo orgânico — a "mancha" que a referência usa atrás das figuras. */}
      <path
        d="M52 66c14-34 58-52 104-49 46 3 84 24 106 56 22 32 20 74-6 100-26 26-78 38-128 32C78 199 40 174 32 140c-8-34 6-40 20-74Z"
        fill="url(#buyersArtBlob)"
      />

      {/* Ficha de busca ao fundo, levemente inclinada. */}
      <g transform="rotate(-7 216 76)">
        <rect x="168" y="34" width="112" height="80" rx="14" fill="url(#buyersArtCard)" />
        <rect x="168" y="34" width="112" height="80" rx="14" stroke="#DBE7FB" strokeWidth="2" />
        <rect x="182" y="50" width="44" height="8" rx="4" fill="#BFD8FB" />
        <rect x="182" y="66" width="72" height="7" rx="3.5" fill="#E2ECFB" />
        <rect x="182" y="80" width="58" height="7" rx="3.5" fill="#E2ECFB" />
        <rect x="182" y="94" width="34" height="7" rx="3.5" fill="#E2ECFB" />
      </g>

      {/* Pessoa ao fundo (a "segunda" da referência). */}
      <g opacity="0.75">
        <circle cx="118" cy="82" r="21" fill="url(#buyersArtMid)" />
        <path d="M86 146c0-19 14-33 32-33s32 14 32 33v6H86v-6Z" fill="url(#buyersArtMid)" />
      </g>

      {/* Pessoa à frente, com volume mais forte. */}
      <circle cx="86" cy="100" r="25" fill="url(#buyersArtDeep)" />
      <path d="M48 172c0-22 17-38 38-38s38 16 38 38v8H48v-8Z" fill="url(#buyersArtDeep)" />
      {/* Realce de luz no ombro — o que dá o aspecto "3D suave". */}
      <path d="M62 152c4-10 13-16 24-16v14c-7 0-13 4-16 10l-8-8Z" fill="#FFFFFF" opacity="0.22" />

      {/* Lupa: cabo primeiro, para o anel cobrir a emenda. */}
      <rect
        x="212"
        y="150"
        width="19"
        height="52"
        rx="9.5"
        transform="rotate(-42 212 150)"
        fill="url(#buyersArtDeep)"
      />
      <circle cx="196" cy="132" r="46" fill="url(#buyersArtGlass)" />
      <circle cx="196" cy="132" r="46" stroke="url(#buyersArtDeep)" strokeWidth="11" />
      {/* Brilho do vidro. */}
      <path d="M170 112c6-12 18-20 32-21" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

/** Veículos para avaliação — carro, prancheta com itens conferidos e lupa. */
export function VehiclesArt({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 230"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="vehiclesArtBlob" x1="40" y1="20" x2="280" y2="215" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E4F7F1" />
          <stop offset="1" stopColor="#F3FBF8" />
        </linearGradient>
        <linearGradient id="vehiclesArtBody" x1="70" y1="120" x2="250" y2="200" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5FE0BF" />
          <stop offset="1" stopColor="#12A98A" />
        </linearGradient>
        <linearGradient id="vehiclesArtGlassRoof" x1="110" y1="118" x2="200" y2="152" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E9FBF6" />
          <stop offset="1" stopColor="#B7EEDF" />
        </linearGradient>
        <linearGradient id="vehiclesArtBoard" x1="150" y1="20" x2="270" y2="130" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#EFF6FF" />
        </linearGradient>
        <linearGradient id="vehiclesArtClip" x1="180" y1="14" x2="230" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B8DF0" />
          <stop offset="1" stopColor="#0F4DB6" />
        </linearGradient>
        <linearGradient id="vehiclesArtLens" x1="40" y1="40" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="1" stopColor="#CFF0E6" stopOpacity="0.8" />
        </linearGradient>
      </defs>

      <path
        d="M52 66c14-34 58-52 104-49 46 3 84 24 106 56 22 32 20 74-6 100-26 26-78 38-128 32C78 199 40 174 32 140c-8-34 6-40 20-74Z"
        fill="url(#vehiclesArtBlob)"
      />

      {/*
        PRANCHETA — o "checklist" da referência, ao fundo e à direita. Azul no
        clipe e nos vistos: a conferência organiza a informação DECLARADA, e o
        verde fica reservado ao veículo, que é o assunto.

        A inclinação é pequena (4°) e o bloco ficou dentro da mancha: com 6° e
        112px de largura a borda direita saía do fundo e o cartão parecia
        recortado.
      */}
      <g transform="rotate(4 214 84)">
        <rect x="166" y="34" width="96" height="100" rx="13" fill="url(#vehiclesArtBoard)" />
        <rect x="166" y="34" width="96" height="100" rx="13" stroke="#DBE7FB" strokeWidth="2" />
        <rect x="196" y="25" width="36" height="18" rx="6.5" fill="url(#vehiclesArtClip)" />

        {[58, 82, 106].map((y, index) => (
          <g key={y}>
            <rect x="180" y={y} width="17" height="17" rx="5.5" fill="#EAF2FF" />
            <path
              d={`M184.2 ${y + 9}l3.4 3.4 6-6.6`}
              stroke="#0e62d8"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="204" y={y + 4.5} width={index === 2 ? 30 : 44} height="8" rx="4" fill="#DCE8FA" />
          </g>
        ))}
      </g>

      {/*
        O CARRO. Desenhado depois da prancheta para ficar À FRENTE dela, e maior
        que na primeira versão: numa figura de 320×230 ele ocupava pouco mais de
        um terço da largura e lia-se como adereço da prancheta — o oposto do que
        o cartão diz. Agora atravessa a base inteira, que é o enquadramento da
        referência.
      */}
      <g>
        {/* Sombra de contato: o que assenta o carro no chão. */}
        <ellipse cx="150" cy="203" rx="104" ry="11" fill="#0F766E" opacity="0.10" />

        {/* Cabine. */}
        <path
          d="M92 146c8-22 17-34 29-38 17-5 41-5 58 0 12 4 22 16 30 38H92Z"
          fill="url(#vehiclesArtGlassRoof)"
        />
        {/* Carroceria. */}
        <path
          d="M54 182c0-19 10-31 26-36 10-3 19-3 31-3h67c17 0 31 5 41 15 8 7 12 15 12 25 0 7-5 12-12 12H66c-7 0-12-5-12-13Z"
          fill="url(#vehiclesArtBody)"
        />
        {/* Faixa de luz na lateral — volume sem sombra pesada. */}
        <path d="M74 168h128c5 0 7 2 7 6H67c0-4 2-6 7-6Z" fill="#FFFFFF" opacity="0.32" />
        {/* Farol. */}
        <rect x="216" y="165" width="18" height="10" rx="5" fill="#FFF7D6" />

        {/* Rodas: aro escuro + centro claro. */}
        <circle cx="98" cy="194" r="19" fill="#123B37" />
        <circle cx="98" cy="194" r="8" fill="#E9FBF6" />
        <circle cx="196" cy="194" r="19" fill="#123B37" />
        <circle cx="196" cy="194" r="8" fill="#E9FBF6" />
      </g>

      {/*
        LUPA — acima do carro, não em cima dele.

        Na primeira versão o anel ficava em (78, 86) com raio 36: a borda
        inferior encostava na traseira do carro e as duas peças verdes se
        fundiam numa mancha só. Subindo para (72, 74) e reduzindo para 32, o
        anel respira contra o fundo claro e o carro volta a ser lido inteiro —
        que é o que o cartão promete ("analise o veículo").
      */}
      <rect
        x="86"
        y="94"
        width="15"
        height="36"
        rx="7.5"
        transform="rotate(42 86 94)"
        fill="#0F766E"
      />
      <circle cx="72" cy="74" r="32" fill="url(#vehiclesArtLens)" />
      <circle cx="72" cy="74" r="32" stroke="#12A98A" strokeWidth="9.5" />
      <path d="M55 61c4-8 12-13 20-14" stroke="#FFFFFF" strokeWidth="5.5" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}
