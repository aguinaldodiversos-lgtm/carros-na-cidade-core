import type { ListingCar } from "@/lib/car-data";
import { buyCars } from "@/lib/car-data";
import { SITE_LOGO_SRC } from "@/lib/site/brand-assets";
import { getCityProfile } from "@/services/marketService";

export type SellerDealer = {
  type: "dealer";
  name: string;
  logo: string;
  address: string;
  rating: number;
  phone: string;
  storeSlug: string;
};

export type SellerPrivate = {
  type: "private";
  name: string;
  phone: string;
};

export type SellerInfo = SellerDealer | SellerPrivate;

export type VehicleDetail = {
  id: string;
  slug: string;
  model: string;
  fullName: string;
  price: string;
  condition: "Novo" | "Usado";
  year: string;
  km: string;
  fuel: string;
  transmission: string;
  color: string;
  city: string;
  citySlug: string;
  adCode: string;
  isBelowFipe: boolean;
  fipePrice: string;
  images: string[];
  description: string;
  optionalItems: string[];
  safetyItems: string[];
  comfortItems: string[];
  sellerNotes: string;
  seller: SellerInfo;
};

function isDealerVehicle(
  vehicle: VehicleDetail
): vehicle is VehicleDetail & { seller: SellerDealer } {
  return vehicle.seller.type === "dealer";
}

function toSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toListingCar(detail: VehicleDetail): ListingCar {
  return {
    id: detail.id,
    slug: detail.slug,
    model: detail.model,
    version: detail.fullName.replace(`${detail.model} `, ""),
    yearModel: detail.year,
    km: detail.km,
    city: detail.city,
    price: detail.price,
    image: detail.images[0] ?? "/images/vehicle-placeholder.svg",
    badge: detail.isBelowFipe ? "fipe" : "destaque",
    mediaCount: `1/${detail.images.length}`,
  };
}

const vehiclesSeed: VehicleDetail[] = [
  {
    id: "66376180",
    slug: "byd-song-plus-2023-hibrido-automatico-66376180",
    model: "BYD SONG PLUS",
    fullName: "BYD SONG PLUS 1.5 DM-I Hibrido Automatico",
    price: "R$ 189.990",
    condition: "Usado",
    year: "2023/2024",
    km: "19.428 Km",
    fuel: "Hibrido",
    transmission: "Automatico",
    color: "Preto",
    city: "Sao Paulo (SP)",
    citySlug: "sao-paulo-sp",
    adCode: "66376180",
    isBelowFipe: true,
    fipePrice: "R$ 197.600",
    images: [
      "/images/vehicle-placeholder.svg",
      "/images/vehicle-placeholder.svg",
      "/images/vehicle-placeholder.svg",
      "/images/vehicle-placeholder.svg",
      "/images/vehicle-placeholder.svg",
    ],
    description:
      "SUV hibrido em excelente estado, revisoes em dia, baixa quilometragem e pacote completo de tecnologia. Excelente opcao para quem busca economia com desempenho urbano e rodoviario.",
    optionalItems: [
      "Teto solar panoramico",
      "Central multimidia com Android Auto e Apple CarPlay",
      "Camera 360",
      "Piloto automatico adaptativo",
      "Carregador por inducao",
    ],
    safetyItems: [
      "6 airbags",
      "Frenagem autonoma de emergencia",
      "Assistente de permanencia em faixa",
      "Controle de estabilidade e tracao",
      "Monitor de ponto cego",
    ],
    comfortItems: [
      "Bancos em couro com ajuste eletrico",
      "Ar digital dual zone",
      "Chave presencial",
      "Partida por botao",
    ],
    sellerNotes:
      "Veiculo com laudo cautelar aprovado e garantia de procedencia. Aceitamos troca e financiamento com as principais instituicoes.",
    seller: {
      type: "dealer",
      name: "Premium Motors Sao Paulo",
      logo: SITE_LOGO_SRC,
      address: "Avenida dos Bandeirantes, 4200 - Sao Paulo/SP",
      rating: 4.8,
      phone: "5511998877665",
      storeSlug: "premium-motors-sao-paulo",
    },
  },
  {
    id: "66376181",
    slug: "audi-e-tron-2022-eletrico-performance-66376181",
    model: "AUDI E-TRON",
    fullName: "AUDI E-TRON Sportback Performance Quattro",
    price: "R$ 383.990",
    condition: "Usado",
    year: "2022/2022",
    km: "19.428 Km",
    fuel: "Eletrico",
    transmission: "Automatico",
    color: "Cinza",
    city: "Sao Paulo (SP)",
    citySlug: "sao-paulo-sp",
    adCode: "66376181",
    isBelowFipe: false,
    fipePrice: "R$ 389.500",
    images: [
      "/images/vehicle-placeholder.svg",
      "/images/vehicle-placeholder.svg",
      "/images/vehicle-placeholder.svg",
      "/images/vehicle-placeholder.svg",
    ],
    description: "SUV eletrico premium, alta autonomia e acabamento executivo.",
    optionalItems: ["Suspensao adaptativa", "Som premium", "Farol Matrix LED"],
    safetyItems: ["Frenagem autonoma", "Assistente de faixa", "8 airbags"],
    comfortItems: ["Ar quadrizone", "Bancos com memoria", "Porta-malas eletrico"],
    sellerNotes: "Veiculo impecavel com historico de revisoes em concessionaria.",
    seller: {
      type: "dealer",
      name: "Premium Motors Sao Paulo",
      logo: SITE_LOGO_SRC,
      address: "Avenida dos Bandeirantes, 4200 - Sao Paulo/SP",
      rating: 4.8,
      phone: "5511998877665",
      storeSlug: "premium-motors-sao-paulo",
    },
  },
  {
    id: "66376182",
    slug: "mini-countryman-2020-turbo-hibrido-66376182",
    model: "MINI COUNTRYMAN",
    fullName: "MINI COUNTRYMAN 1.5 Turbo Hybrid Cooper S E",
    price: "R$ 159.900",
    condition: "Usado",
    year: "2020/2021",
    km: "67.000 Km",
    fuel: "Hibrido",
    transmission: "Automatico",
    color: "Preto",
    city: "Valinhos (SP)",
    citySlug: "campinas-sp",
    adCode: "66376182",
    isBelowFipe: true,
    fipePrice: "R$ 168.400",
    images: [
      "/images/vehicle-placeholder.svg",
      "/images/vehicle-placeholder.svg",
      "/images/vehicle-placeholder.svg",
      "/images/vehicle-placeholder.svg",
    ],
    description: "Compacto premium hibrido com excelente dirigibilidade e acabamento refinado.",
    optionalItems: ["Teto solar", "Midia widescreen", "Rodas aro 19"],
    safetyItems: ["Controle de estabilidade", "Airbags frontais e laterais", "Isofix"],
    comfortItems: ["Ar dual zone", "Bancos eletricos", "Sensor de estacionamento"],
    sellerNotes: "Unico dono e manual completo. Disponivel para vistoria.",
    seller: {
      type: "private",
      name: "Vendedor Particular",
      phone: "5511996655443",
    },
  },
];

function parseSlugToVehicle(slug: string): VehicleDetail {
  const parts = slug.split("-");
  const id =
    parts.at(-1) && /^\d+$/.test(parts.at(-1) ?? "") ? (parts.at(-1) as string) : "00000000";
  const city = getCityProfile("sao-paulo-sp");
  const modelRaw = parts.slice(0, -1).join(" ") || "Veiculo";
  const model = modelRaw.split(" ").slice(0, 2).join(" ").toUpperCase();

  return {
    id,
    slug,
    model,
    fullName: toSlug(modelRaw).replace(/-/g, " ").toUpperCase(),
    price: "R$ 129.900",
    condition: "Usado",
    year: "2021/2022",
    km: "45.000 Km",
    fuel: "Flex",
    transmission: "Automatico",
    color: "Prata",
    city: city.displayName,
    citySlug: city.slug,
    adCode: id,
    isBelowFipe: false,
    fipePrice: "R$ 134.000",
    images: ["/images/vehicle-placeholder.svg", "/images/vehicle-placeholder.svg", "/images/vehicle-placeholder.svg"],
    description:
      "Veiculo com bom historico de manutencao, pronto para uso e com documentacao regularizada.",
    optionalItems: ["Midia touchscreen", "Sensor de estacionamento"],
    safetyItems: ["Airbags frontais", "ABS e controle de estabilidade"],
    comfortItems: ["Ar-condicionado", "Direcao eletrica", "Vidros e travas eletricos"],
    sellerNotes: "Negociacao transparente com possibilidade de financiamento e avaliacao de troca.",
    seller: {
      type: "private",
      name: "Vendedor Particular",
      phone: "5511990000000",
    },
  };
}

export function getVehicleSlugs(limit = 120) {
  const slugs = vehiclesSeed.map((vehicle) => vehicle.slug);
  return slugs.slice(0, limit);
}

export async function getVehicleBySlug(slug: string): Promise<VehicleDetail> {
  const normalized = slug.toLowerCase();
  const found = vehiclesSeed.find((vehicle) => vehicle.slug === normalized);
  return found ?? parseSlugToVehicle(normalized);
}

export async function getSellerVehicles(vehicle: VehicleDetail): Promise<ListingCar[]> {
  if (vehicle.seller.type !== "dealer") {
    return [];
  }
  const storeSlug = vehicle.seller.storeSlug;

  return vehiclesSeed
    .filter(isDealerVehicle)
    .filter((seed) => seed.seller.storeSlug === storeSlug && seed.id !== vehicle.id)
    .map(toListingCar);
}

export async function getCityVehicles(vehicle: VehicleDetail): Promise<ListingCar[]> {
  const seededCityVehicles = vehiclesSeed
    .filter((seed) => seed.citySlug === vehicle.citySlug && seed.id !== vehicle.id)
    .map(toListingCar);

  const dynamicCityVehicles = buyCars.slice(0, 6).map((car, index) => ({
    ...car,
    id: `${car.id}-${vehicle.citySlug}-${index}`,
    slug: `${toSlug(car.model)}-${car.yearModel.split("/")[0]}-${10000000 + index}`,
    city: vehicle.city,
  }));

  return [...seededCityVehicles, ...dynamicCityVehicles];
}

export async function getSimilarVehicles(vehicle: VehicleDetail): Promise<ListingCar[]> {
  return buyCars.slice(0, 8).map((car, index) => ({
    ...car,
    id: `${car.id}-sim-${vehicle.id}-${index}`,
    slug: `${toSlug(car.model)}-${car.yearModel.split("/")[0]}-${20000000 + index}`,
    city: vehicle.city,
  }));
}
