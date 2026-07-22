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
