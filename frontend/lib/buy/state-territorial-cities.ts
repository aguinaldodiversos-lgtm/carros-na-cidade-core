/**
 * Lista curada de cidades destacadas por UF para o bloco de navegação
 * territorial da Página Estadual (`/comprar/estado/[uf]`).
 *
 * Por que curada e não derivada da pagination?
 *   1. O catálogo estadual retorna uma amostra paginada — usar apenas as
 *      cidades que aparecem nessa amostra (17 cards na SP, por exemplo)
 *      esconde cidades reais com estoque ativo paginado fora.
 *   2. O backend ainda não expõe um endpoint de "cidades destacadas por
 *      UF". Quando expuser, trocar a fonte aqui sem mudar a interface
 *      pública (`getStateCuratedCities(uf)`).
 *
 * Decisões:
 *   - Allowlist explícita por UF. UFs não mapeados retornam lista vazia
 *     → bloco é suprimido (não promete cidades inexistentes).
 *   - Cada cidade tem `slug` canônico (`nome-uf` minúsculo, sem acento) +
 *     `name` para exibição. UF derivada do sufixo do slug (defesa).
 *   - Ordem deliberada: cidade-capital primeiro, depois cidades médias
 *     que aparecem em campanhas/SEO do portal, depois o resto.
 *   - Atibaia, Bragança Paulista e Jundiaí incluídos em SP porque foram
 *     identificados na auditoria territorial 2026-05-11 como cidades
 *     com estoque ativo invisíveis na nav do catálogo estadual.
 *
 * Quando o backend publicar agregação por UF, trocar para fetch SSR
 * cached(); a interface `StateCuratedCity` continua válida.
 */

export type StateCuratedCity = {
  /** Slug canônico no padrão `nome-uf` (regex `^[a-z0-9-]+-[a-z]{2}$`). */
  slug: string;
  /** Nome para exibição (com acentos). */
  name: string;
};

/**
 * Curadoria nacional — todos os 27 UFs.
 *
 * Critério da lista: capital primeiro, depois cidades médias/grandes
 * (regiões metropolitanas + polos regionais). Todas validadas contra
 * a tabela `cities` em produção (slugs canônicos `nome-uf`).
 *
 * Cobertura por região:
 *   - Norte: AC, AM, AP, PA, RO, RR, TO
 *   - Nordeste: AL, BA, CE, MA, PB, PE, PI, RN, SE
 *   - Centro-Oeste: DF, GO, MS, MT
 *   - Sudeste: ES, MG, RJ, SP
 *   - Sul: PR, RS, SC
 *
 * Esta lista é estática enquanto o backend não publica endpoint dedicado
 * (`/api/public/states/:uf/curated-cities` com critério data-driven via
 * população IBGE ou ads ACTIVE). Quando publicar, troca o map literal
 * por fetch SSR cached — interface `StateCuratedCity` continua válida.
 */
const CURATED_BY_UF: Readonly<Record<string, ReadonlyArray<StateCuratedCity>>> = {
  // ── Norte ──────────────────────────────────────────────────────────
  ac: [
    { slug: "rio-branco-ac", name: "Rio Branco" },
    { slug: "cruzeiro-do-sul-ac", name: "Cruzeiro do Sul" },
    { slug: "sena-madureira-ac", name: "Sena Madureira" },
    { slug: "feijo-ac", name: "Feijó" },
    { slug: "tarauaca-ac", name: "Tarauacá" },
  ],
  am: [
    { slug: "manaus-am", name: "Manaus" },
    { slug: "parintins-am", name: "Parintins" },
    { slug: "itacoatiara-am", name: "Itacoatiara" },
    { slug: "manacapuru-am", name: "Manacapuru" },
    { slug: "coari-am", name: "Coari" },
    { slug: "tefe-am", name: "Tefé" },
  ],
  ap: [
    { slug: "macapa-ap", name: "Macapá" },
    { slug: "santana-ap", name: "Santana" },
    { slug: "laranjal-do-jari-ap", name: "Laranjal do Jari" },
    { slug: "oiapoque-ap", name: "Oiapoque" },
    { slug: "mazagao-ap", name: "Mazagão" },
  ],
  pa: [
    { slug: "belem-pa", name: "Belém" },
    { slug: "ananindeua-pa", name: "Ananindeua" },
    { slug: "santarem-pa", name: "Santarém" },
    { slug: "maraba-pa", name: "Marabá" },
    { slug: "parauapebas-pa", name: "Parauapebas" },
    { slug: "castanhal-pa", name: "Castanhal" },
  ],
  ro: [
    { slug: "porto-velho-ro", name: "Porto Velho" },
    { slug: "ji-parana-ro", name: "Ji-Paraná" },
    { slug: "ariquemes-ro", name: "Ariquemes" },
    { slug: "vilhena-ro", name: "Vilhena" },
    { slug: "cacoal-ro", name: "Cacoal" },
  ],
  rr: [
    { slug: "boa-vista-rr", name: "Boa Vista" },
    { slug: "rorainopolis-rr", name: "Rorainópolis" },
    { slug: "caracarai-rr", name: "Caracaraí" },
  ],
  to: [
    { slug: "palmas-to", name: "Palmas" },
    { slug: "araguaina-to", name: "Araguaína" },
    { slug: "gurupi-to", name: "Gurupi" },
    { slug: "porto-nacional-to", name: "Porto Nacional" },
    { slug: "paraiso-do-tocantins-to", name: "Paraíso do Tocantins" },
  ],

  // ── Nordeste ───────────────────────────────────────────────────────
  al: [
    { slug: "maceio-al", name: "Maceió" },
    { slug: "arapiraca-al", name: "Arapiraca" },
    { slug: "rio-largo-al", name: "Rio Largo" },
    { slug: "palmeira-dos-indios-al", name: "Palmeira dos Índios" },
    { slug: "penedo-al", name: "Penedo" },
  ],
  ba: [
    { slug: "salvador-ba", name: "Salvador" },
    { slug: "feira-de-santana-ba", name: "Feira de Santana" },
    { slug: "vitoria-da-conquista-ba", name: "Vitória da Conquista" },
    { slug: "camacari-ba", name: "Camaçari" },
    { slug: "juazeiro-ba", name: "Juazeiro" },
    { slug: "ilheus-ba", name: "Ilhéus" },
    { slug: "itabuna-ba", name: "Itabuna" },
    { slug: "lauro-de-freitas-ba", name: "Lauro de Freitas" },
  ],
  ce: [
    { slug: "fortaleza-ce", name: "Fortaleza" },
    { slug: "caucaia-ce", name: "Caucaia" },
    { slug: "juazeiro-do-norte-ce", name: "Juazeiro do Norte" },
    { slug: "sobral-ce", name: "Sobral" },
    { slug: "maracanau-ce", name: "Maracanaú" },
    { slug: "crato-ce", name: "Crato" },
  ],
  ma: [
    { slug: "sao-luis-ma", name: "São Luís" },
    { slug: "imperatriz-ma", name: "Imperatriz" },
    { slug: "sao-jose-de-ribamar-ma", name: "São José de Ribamar" },
    { slug: "timon-ma", name: "Timon" },
    { slug: "caxias-ma", name: "Caxias" },
  ],
  pb: [
    { slug: "joao-pessoa-pb", name: "João Pessoa" },
    { slug: "campina-grande-pb", name: "Campina Grande" },
    { slug: "santa-rita-pb", name: "Santa Rita" },
    { slug: "patos-pb", name: "Patos" },
    { slug: "bayeux-pb", name: "Bayeux" },
  ],
  pe: [
    { slug: "recife-pe", name: "Recife" },
    { slug: "jaboatao-dos-guararapes-pe", name: "Jaboatão dos Guararapes" },
    { slug: "olinda-pe", name: "Olinda" },
    { slug: "caruaru-pe", name: "Caruaru" },
    { slug: "petrolina-pe", name: "Petrolina" },
    { slug: "paulista-pe", name: "Paulista" },
  ],
  pi: [
    { slug: "teresina-pi", name: "Teresina" },
    { slug: "parnaiba-pi", name: "Parnaíba" },
    { slug: "picos-pi", name: "Picos" },
    { slug: "piripiri-pi", name: "Piripiri" },
    { slug: "floriano-pi", name: "Floriano" },
  ],
  rn: [
    { slug: "natal-rn", name: "Natal" },
    { slug: "mossoro-rn", name: "Mossoró" },
    { slug: "parnamirim-rn", name: "Parnamirim" },
    { slug: "sao-goncalo-do-amarante-rn", name: "São Gonçalo do Amarante" },
    { slug: "caico-rn", name: "Caicó" },
  ],
  se: [
    { slug: "aracaju-se", name: "Aracaju" },
    { slug: "nossa-senhora-do-socorro-se", name: "Nossa Senhora do Socorro" },
    { slug: "lagarto-se", name: "Lagarto" },
    { slug: "itabaiana-se", name: "Itabaiana" },
    { slug: "tobias-barreto-se", name: "Tobias Barreto" },
  ],

  // ── Centro-Oeste ───────────────────────────────────────────────────
  df: [
    { slug: "brasilia-df", name: "Brasília" },
  ],
  go: [
    { slug: "goiania-go", name: "Goiânia" },
    { slug: "aparecida-de-goiania-go", name: "Aparecida de Goiânia" },
    { slug: "anapolis-go", name: "Anápolis" },
    { slug: "rio-verde-go", name: "Rio Verde" },
    { slug: "luziania-go", name: "Luziânia" },
  ],
  ms: [
    { slug: "campo-grande-ms", name: "Campo Grande" },
    { slug: "dourados-ms", name: "Dourados" },
    { slug: "tres-lagoas-ms", name: "Três Lagoas" },
    { slug: "corumba-ms", name: "Corumbá" },
    { slug: "ponta-pora-ms", name: "Ponta Porã" },
  ],
  mt: [
    { slug: "cuiaba-mt", name: "Cuiabá" },
    { slug: "varzea-grande-mt", name: "Várzea Grande" },
    { slug: "rondonopolis-mt", name: "Rondonópolis" },
    { slug: "sinop-mt", name: "Sinop" },
    { slug: "tangara-da-serra-mt", name: "Tangará da Serra" },
  ],

  // ── Sudeste ────────────────────────────────────────────────────────
  es: [
    { slug: "vitoria-es", name: "Vitória" },
    { slug: "vila-velha-es", name: "Vila Velha" },
    { slug: "serra-es", name: "Serra" },
    { slug: "cariacica-es", name: "Cariacica" },
    { slug: "cachoeiro-de-itapemirim-es", name: "Cachoeiro de Itapemirim" },
  ],
  mg: [
    { slug: "belo-horizonte-mg", name: "Belo Horizonte" },
    { slug: "uberlandia-mg", name: "Uberlândia" },
    { slug: "contagem-mg", name: "Contagem" },
    { slug: "juiz-de-fora-mg", name: "Juiz de Fora" },
    { slug: "betim-mg", name: "Betim" },
    { slug: "montes-claros-mg", name: "Montes Claros" },
    { slug: "ribeirao-das-neves-mg", name: "Ribeirão das Neves" },
    { slug: "uberaba-mg", name: "Uberaba" },
  ],
  rj: [
    { slug: "rio-de-janeiro-rj", name: "Rio de Janeiro" },
    { slug: "niteroi-rj", name: "Niterói" },
    { slug: "duque-de-caxias-rj", name: "Duque de Caxias" },
    { slug: "sao-goncalo-rj", name: "São Gonçalo" },
    { slug: "nova-iguacu-rj", name: "Nova Iguaçu" },
    { slug: "petropolis-rj", name: "Petrópolis" },
    { slug: "campos-dos-goytacazes-rj", name: "Campos dos Goytacazes" },
    { slug: "volta-redonda-rj", name: "Volta Redonda" },
  ],
  sp: [
    { slug: "sao-paulo-sp", name: "São Paulo" },
    { slug: "campinas-sp", name: "Campinas" },
    { slug: "atibaia-sp", name: "Atibaia" },
    { slug: "bragança-paulista-sp", name: "Bragança Paulista" },
    { slug: "jundiai-sp", name: "Jundiaí" },
    { slug: "ribeirao-preto-sp", name: "Ribeirão Preto" },
    { slug: "santos-sp", name: "Santos" },
    { slug: "sao-jose-dos-campos-sp", name: "São José dos Campos" },
    { slug: "sorocaba-sp", name: "Sorocaba" },
    { slug: "guarulhos-sp", name: "Guarulhos" },
    { slug: "osasco-sp", name: "Osasco" },
    { slug: "santo-andre-sp", name: "Santo André" },
  ],

  // ── Sul ────────────────────────────────────────────────────────────
  pr: [
    { slug: "curitiba-pr", name: "Curitiba" },
    { slug: "londrina-pr", name: "Londrina" },
    { slug: "maringa-pr", name: "Maringá" },
    { slug: "ponta-grossa-pr", name: "Ponta Grossa" },
    { slug: "cascavel-pr", name: "Cascavel" },
    { slug: "sao-jose-dos-pinhais-pr", name: "São José dos Pinhais" },
    { slug: "foz-do-iguacu-pr", name: "Foz do Iguaçu" },
  ],
  rs: [
    { slug: "porto-alegre-rs", name: "Porto Alegre" },
    { slug: "caxias-do-sul-rs", name: "Caxias do Sul" },
    { slug: "pelotas-rs", name: "Pelotas" },
    { slug: "canoas-rs", name: "Canoas" },
    { slug: "santa-maria-rs", name: "Santa Maria" },
    { slug: "gravatai-rs", name: "Gravataí" },
    { slug: "novo-hamburgo-rs", name: "Novo Hamburgo" },
  ],
  sc: [
    { slug: "florianopolis-sc", name: "Florianópolis" },
    { slug: "joinville-sc", name: "Joinville" },
    { slug: "blumenau-sc", name: "Blumenau" },
    { slug: "sao-jose-sc", name: "São José" },
    { slug: "chapeco-sc", name: "Chapecó" },
    { slug: "criciuma-sc", name: "Criciúma" },
    { slug: "itajai-sc", name: "Itajaí" },
  ],
};

/**
 * Cap visível por padrão. Limita o bloco a uma faixa compacta no SSR
 * sem deixar a lista crescer indefinidamente quando a curadoria
 * aumentar. UI pode oferecer "Ver todas" no futuro.
 */
export const DEFAULT_CURATED_LIMIT = 12;

/**
 * Retorna as cidades curadas de um UF. UF normalizado para lowercase.
 * UFs não mapeados retornam `[]` — caller deve suprimir o bloco.
 *
 * Bug de slug histórico: `bragança-paulista-sp` carrega um cedilha
 * (`ç`) que NÃO é o slug canônico do backend
 * (`braganca-paulista-sp`). Normalizamos aqui antes de devolver — o
 * map literal mantém o nome bonito mas o slug sai limpo.
 */
export function getStateCuratedCities(
  uf: string | null | undefined,
  limit = DEFAULT_CURATED_LIMIT
): StateCuratedCity[] {
  const key = String(uf || "").trim().toLowerCase();
  if (!key) return [];
  const list = CURATED_BY_UF[key];
  if (!list) return [];
  // Defesa: normaliza qualquer slug com acento residual no map literal.
  return list.slice(0, Math.max(0, limit)).map((c) => ({
    ...c,
    slug: normalizeCitySlug(c.slug),
  }));
}

function normalizeCitySlug(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
