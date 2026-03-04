export type BadgeType = "destaque" | "fipe";

export type ListingCar = {
  id: string;
  slug?: string;
  model: string;
  version: string;
  yearModel: string;
  km: string;
  city: string;
  price: string;
  image: string;
  badge?: BadgeType;
  mediaCount?: string;
};

export type HomeCar = ListingCar;
export type BuyCar = ListingCar;

export const homeHighlights: HomeCar[] = [
  {
    id: "corolla-2023",
    model: "TOYOTA COROLLA",
    version: "2.0 Altis Premium Flex Automatico",
    yearModel: "2023/2023",
    km: "21.800 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 112.900",
    image: "/images/corolla.jpeg",
    badge: "destaque",
    mediaCount: "1/18",
  },
  {
    id: "civic-2021",
    model: "HONDA CIVIC",
    version: "Touring Turbo 1.5 Automatico",
    yearModel: "2021/2021",
    km: "43.200 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 98.900",
    image: "/images/civic.jpeg",
    badge: "fipe",
    mediaCount: "1/15",
  },
  {
    id: "compass-2022",
    model: "JEEP COMPASS",
    version: "Longitude T270 Flex Automatico",
    yearModel: "2022/2022",
    km: "37.100 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 129.900",
    image: "/images/compass.jpeg",
    badge: "destaque",
    mediaCount: "1/20",
  },
  {
    id: "hb20-2020",
    model: "HYUNDAI HB20",
    version: "Comfort Plus 1.0 Flex Manual",
    yearModel: "2020/2020",
    km: "58.000 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 74.900",
    image: "/images/hb20.jpeg",
    badge: "fipe",
    mediaCount: "1/12",
  },
];

export const homeDeals: HomeCar[] = [
  {
    id: "creta-2022",
    model: "HYUNDAI CRETA",
    version: "Pulse Plus 1.6 Flex Automatico",
    yearModel: "2022/2022",
    km: "34.000 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 89.900",
    image: "/images/hb20.jpeg",
    badge: "fipe",
    mediaCount: "1/11",
  },
  {
    id: "tcross-2021",
    model: "VOLKSWAGEN T-CROSS",
    version: "Comfortline 200 TSI Automatico",
    yearModel: "2021/2021",
    km: "51.000 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 97.900",
    image: "/images/compass.jpeg",
    badge: "fipe",
    mediaCount: "1/16",
  },
  {
    id: "kicks-2023",
    model: "NISSAN KICKS",
    version: "Advance 1.6 CVT Flex",
    yearModel: "2023/2023",
    km: "18.700 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 96.900",
    image: "/images/civic.jpeg",
    badge: "fipe",
    mediaCount: "1/14",
  },
  {
    id: "onix-2020",
    model: "CHEVROLET ONIX",
    version: "LT Turbo 1.0 Flex Automatico",
    yearModel: "2020/2020",
    km: "66.300 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 65.900",
    image: "/images/corolla.jpeg",
    badge: "fipe",
    mediaCount: "1/10",
  },
];

export const buyCars: BuyCar[] = [
  {
    id: "yuan-plus",
    model: "BYD YUAN PLUS",
    version: "Eletrico Performance AWD",
    yearModel: "2023/2023",
    km: "5.000 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 235.990",
    image: "/images/banner2.jpg",
    badge: "destaque",
    mediaCount: "1/8",
  },
  {
    id: "nissan-kicks-2022",
    model: "NISSAN KICKS",
    version: "Sense 1.6 CVT Flex",
    yearModel: "2022/2022",
    km: "18.000 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 98.900",
    image: "/images/banner1.jpg",
    badge: "fipe",
    mediaCount: "1/15",
  },
  {
    id: "taos-2022",
    model: "VOLKSWAGEN TAOS",
    version: "Highline 250 TSI Automatico",
    yearModel: "2022/2022",
    km: "128.050 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 159.900",
    image: "/images/compass.jpeg",
    badge: "destaque",
    mediaCount: "1/9",
  },
  {
    id: "tiggo-2021",
    model: "CAOA CHERY TIGGO 7",
    version: "TXS 1.5 Turbo Flex Automatico",
    yearModel: "2021/2021",
    km: "48.000 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 159.900",
    image: "/images/civic.jpeg",
    badge: "fipe",
    mediaCount: "1/13",
  },
  {
    id: "renegade-2020",
    model: "JEEP RENEGADE",
    version: "Longitude T270 Flex Automatico",
    yearModel: "2020/2020",
    km: "6.000 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 115.900",
    image: "/images/hb20.jpeg",
    badge: "destaque",
    mediaCount: "1/7",
  },
  {
    id: "renegade-2022",
    model: "JEEP RENEGADE",
    version: "Longitude T270 Flex Automatico",
    yearModel: "2022/2022",
    km: "150.000 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 115.900",
    image: "/images/corolla.jpeg",
    badge: "destaque",
    mediaCount: "1/14",
  },
  {
    id: "civic-2021-buy",
    model: "HONDA CIVIC",
    version: "Touring 1.5 Turbo Automatico",
    yearModel: "2021/2021",
    km: "22.000 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 125.900",
    image: "/images/civic.jpeg",
    badge: "destaque",
    mediaCount: "1/12",
  },
  {
    id: "onix-2021",
    model: "CHEVROLET ONIX",
    version: "LT 1.0 Turbo Flex Automatico",
    yearModel: "2021/2021",
    km: "50.000 Km",
    city: "Sao Paulo (SP)",
    price: "R$ 79.900",
    image: "/images/hb20.jpeg",
    badge: "fipe",
    mediaCount: "1/10",
  },
];
