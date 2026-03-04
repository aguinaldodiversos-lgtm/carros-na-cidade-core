import { buyCars, type ListingCar } from "@/lib/car-data";

export type CityProfile = {
  slug: string;
  name: string;
  uf: string;
  state: string;
  displayName: string;
};

export type MarketStat = {
  label: string;
  value: string;
  description: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type BlogArticle = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  publishedAt: string;
  readTime: string;
  author: string;
  image: string;
};

type CitySeed = {
  slug: string;
  name: string;
  uf: string;
  state: string;
};

const citySeeds: CitySeed[] = [
  { slug: "sao-paulo-sp", name: "Sao Paulo", uf: "SP", state: "Sao Paulo" },
  { slug: "rio-de-janeiro-rj", name: "Rio de Janeiro", uf: "RJ", state: "Rio de Janeiro" },
  { slug: "belo-horizonte-mg", name: "Belo Horizonte", uf: "MG", state: "Minas Gerais" },
  { slug: "curitiba-pr", name: "Curitiba", uf: "PR", state: "Parana" },
  { slug: "porto-alegre-rs", name: "Porto Alegre", uf: "RS", state: "Rio Grande do Sul" },
  { slug: "salvador-ba", name: "Salvador", uf: "BA", state: "Bahia" },
  { slug: "fortaleza-ce", name: "Fortaleza", uf: "CE", state: "Ceara" },
  { slug: "recife-pe", name: "Recife", uf: "PE", state: "Pernambuco" },
  { slug: "brasilia-df", name: "Brasilia", uf: "DF", state: "Distrito Federal" },
  { slug: "goiania-go", name: "Goiania", uf: "GO", state: "Goias" },
  { slug: "campinas-sp", name: "Campinas", uf: "SP", state: "Sao Paulo" },
  { slug: "santos-sp", name: "Santos", uf: "SP", state: "Sao Paulo" },
  { slug: "guarulhos-sp", name: "Guarulhos", uf: "SP", state: "Sao Paulo" },
  { slug: "osasco-sp", name: "Osasco", uf: "SP", state: "Sao Paulo" },
  { slug: "sao-jose-dos-campos-sp", name: "Sao Jose dos Campos", uf: "SP", state: "Sao Paulo" },
  { slug: "niteroi-rj", name: "Niteroi", uf: "RJ", state: "Rio de Janeiro" },
  { slug: "duque-de-caxias-rj", name: "Duque de Caxias", uf: "RJ", state: "Rio de Janeiro" },
  { slug: "nova-iguacu-rj", name: "Nova Iguacu", uf: "RJ", state: "Rio de Janeiro" },
  { slug: "contagem-mg", name: "Contagem", uf: "MG", state: "Minas Gerais" },
  { slug: "juiz-de-fora-mg", name: "Juiz de Fora", uf: "MG", state: "Minas Gerais" },
  { slug: "londrina-pr", name: "Londrina", uf: "PR", state: "Parana" },
  { slug: "maringa-pr", name: "Maringa", uf: "PR", state: "Parana" },
  { slug: "joinville-sc", name: "Joinville", uf: "SC", state: "Santa Catarina" },
  { slug: "florianopolis-sc", name: "Florianopolis", uf: "SC", state: "Santa Catarina" },
  { slug: "blumenau-sc", name: "Blumenau", uf: "SC", state: "Santa Catarina" },
  { slug: "vitoria-es", name: "Vitoria", uf: "ES", state: "Espirito Santo" },
  { slug: "cuiaba-mt", name: "Cuiaba", uf: "MT", state: "Mato Grosso" },
  { slug: "campo-grande-ms", name: "Campo Grande", uf: "MS", state: "Mato Grosso do Sul" },
  { slug: "manaus-am", name: "Manaus", uf: "AM", state: "Amazonas" },
  { slug: "belem-pa", name: "Belem", uf: "PA", state: "Para" },
  { slug: "sao-luis-ma", name: "Sao Luis", uf: "MA", state: "Maranhao" },
  { slug: "natal-rn", name: "Natal", uf: "RN", state: "Rio Grande do Norte" },
  { slug: "joao-pessoa-pb", name: "Joao Pessoa", uf: "PB", state: "Paraiba" },
  { slug: "maceio-al", name: "Maceio", uf: "AL", state: "Alagoas" },
  { slug: "teresina-pi", name: "Teresina", uf: "PI", state: "Piaui" },
  { slug: "aracaju-se", name: "Aracaju", uf: "SE", state: "Sergipe" },
  { slug: "palmas-to", name: "Palmas", uf: "TO", state: "Tocantins" },
  { slug: "porto-velho-ro", name: "Porto Velho", uf: "RO", state: "Rondonia" },
  { slug: "rio-branco-ac", name: "Rio Branco", uf: "AC", state: "Acre" },
  { slug: "boa-vista-rr", name: "Boa Vista", uf: "RR", state: "Roraima" },
  { slug: "macapa-ap", name: "Macapa", uf: "AP", state: "Amapa" },
];

const stateMap: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapa",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceara",
  DF: "Distrito Federal",
  ES: "Espirito Santo",
  GO: "Goias",
  MA: "Maranhao",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Para",
  PB: "Paraiba",
  PR: "Parana",
  PE: "Pernambuco",
  PI: "Piaui",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondonia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "Sao Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fallbackCityFromSlug(slug: string): CityProfile {
  const parts = slug.toLowerCase().split("-").filter(Boolean);
  const ufCandidate = (parts.at(-1) ?? "sp").toUpperCase();
  const uf = ufCandidate.length === 2 ? ufCandidate : "SP";
  const cityPart = parts.slice(0, ufCandidate.length === 2 ? -1 : undefined).join(" ");
  const cityName = toTitleCase(cityPart || "Sao Paulo");
  const state = stateMap[uf] ?? "Sao Paulo";

  return {
    slug,
    name: cityName,
    uf,
    state,
    displayName: `${cityName} (${uf})`,
  };
}

function hashString(input: string) {
  return input.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function toSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getCityProfile(cidade: string): CityProfile {
  const slug = cidade.toLowerCase();
  const found = citySeeds.find((city) => city.slug === slug);
  if (found) {
    return {
      ...found,
      displayName: `${found.name} (${found.uf})`,
    };
  }
  return fallbackCityFromSlug(slug);
}

export function getStaticCitySlugs(limit = 120) {
  return citySeeds.slice(0, limit).map((city) => city.slug);
}

export function getVehiclesByCity(cidade: string, limit = 8): ListingCar[] {
  const city = getCityProfile(cidade);
  return buyCars.slice(0, limit).map((car, index) => ({
    ...car,
    id: `${car.id}-${city.slug}-${index}`,
    slug: `${toSlug(car.model)}-${car.yearModel.split("/")[0]}-${30000000 + index}`,
    city: city.displayName,
  }));
}

export function getFipeStatsByCity(cidade: string): MarketStat[] {
  const city = getCityProfile(cidade);
  const hash = hashString(city.slug);
  const avgPrice = 62000 + (hash % 55) * 1000;
  const belowFipe = 14 + (hash % 11);
  const liquidity = 18 + (hash % 12);

  return [
    {
      label: "Media FIPE local",
      value: `R$ ${(avgPrice / 1000).toFixed(0)} mil`,
      description: `Media de avaliacao dos carros mais buscados em ${city.name}.`,
    },
    {
      label: "Anuncios abaixo da FIPE",
      value: `${belowFipe}%`,
      description: "Proporcao de ofertas competitivas detectadas pelo Cerebro IA.",
    },
    {
      label: "Velocidade de venda",
      value: `${liquidity} dias`,
      description: "Tempo medio estimado para veiculos com preco aderente ao mercado.",
    },
    {
      label: "Busca organica estimada",
      value: `${90 + (hash % 80)}k`,
      description: "Volume mensal potencial para termos de compra e avaliacao na cidade.",
    },
  ];
}

export function getFinancingStatsByCity(cidade: string): MarketStat[] {
  const city = getCityProfile(cidade);
  const hash = hashString(city.slug);
  return [
    {
      label: "Taxa media aprovada",
      value: `${(1.1 + (hash % 6) * 0.1).toFixed(2)}% a.m.`,
      description: `Media das simulacoes aprovadas em ${city.name}.`,
    },
    {
      label: "Prazo mais contratado",
      value: `${36 + (hash % 4) * 12} meses`,
      description: "Faixa de prazo com melhor equilibrio entre parcela e custo total.",
    },
    {
      label: "Entrada recomendada",
      value: `${18 + (hash % 9)}%`,
      description: "Percentual sugerido para reduzir juros e melhorar score de credito.",
    },
    {
      label: "Aprovacao estimada",
      value: `${67 + (hash % 21)}%`,
      description: "Probabilidade media com renda formal e historico positivo.",
    },
  ];
}

export function getFipeFaqByCity(cidade: string): FaqItem[] {
  const city = getCityProfile(cidade);
  return [
    {
      question: `Como consultar a Tabela FIPE em ${city.name}?`,
      answer:
        "Selecione tipo de veiculo, marca, modelo e ano/combustivel para obter o valor de referencia atualizado.",
    },
    {
      question: "A Tabela FIPE define o preco final de venda?",
      answer:
        "Nao. A FIPE serve como referencia. Quilometragem, conservacao, historico e demanda local podem alterar o valor real.",
    },
    {
      question: `Como encontrar veiculos abaixo da FIPE em ${city.name}?`,
      answer:
        "Use os filtros do portal e veja os anuncios marcados como Abaixo da FIPE pelo Cerebro IA para priorizar oportunidades.",
    },
    {
      question: "A FIPE muda todo mes?",
      answer:
        "Sim. A base e atualizada mensalmente de acordo com o comportamento de mercado e variacoes de negociacao.",
    },
  ];
}

const categoryPool = ["Mercado", "Tecnologia", "Eletricos", "Economia", "Lancamentos", "Dicas"];
const imagePool = ["/images/banner1.jpg", "/images/banner2.jpg", "/images/civic.jpeg", "/images/compass.jpeg", "/images/corolla.jpeg"];

export function getBlogArticlesByCity(cidade: string): BlogArticle[] {
  const city = getCityProfile(cidade);
  const hash = hashString(city.slug);

  return Array.from({ length: 8 }).map((_, index) => {
    const category = categoryPool[(index + hash) % categoryPool.length];
    const image = imagePool[index % imagePool.length];
    const day = 2 + index;
    const slug = `${city.slug}-${category.toLowerCase()}-${index + 1}`;

    return {
      slug,
      title: `${category}: carros em destaque em ${city.name} para ${2026 + (index % 2)}`,
      summary:
        "Levantamento local com dados de preco, giro de estoque, demanda por combustivel e oportunidades abaixo da FIPE.",
      category,
      publishedAt: `2026-02-${String(day).padStart(2, "0")}`,
      readTime: `${4 + (index % 4)} min`,
      author: "Redacao Carros na Cidade",
      image,
    };
  });
}
