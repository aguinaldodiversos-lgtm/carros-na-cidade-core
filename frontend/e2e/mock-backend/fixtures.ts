/**
 * Deterministic fixture data for the mock backend.
 * Covers: users, dashboard, ads, facets, plans, cities.
 */

export const fixtures = {
  users: [
    {
      id: "e2e-pf-1",
      email: "cpf@carrosnacidade.com",
      password: "123456",
      name: "Teste PF",
      account_type: "cpf" as const,
    },
    {
      id: "e2e-pj-1",
      email: "cnpj@carrosnacidade.com",
      password: "123456",
      name: "Loja Teste PJ",
      account_type: "cnpj" as const,
    },
  ],

  dashboard: {
    user: {
      id: "e2e-pf-1",
      email: "cpf@carrosnacidade.com",
      name: "Teste PF",
      account_type: "cpf",
      document_verified: true,
    },
    advertiser: {
      id: "adv-pf-1",
      plan: "free",
      ads_active: 1,
      ads_limit: 3,
    },
    ads: [
      {
        id: "ad-1",
        slug: "fiat-uno-2020-atibaia-sp",
        brand: "Fiat",
        model: "Uno",
        year: 2020,
        price: 35000,
        status: "active",
        city: "Atibaia",
        state: "SP",
        photo_urls: ["/mock/car-1.jpg"],
      },
    ],
  },

  ads: [
    {
      id: "ad-1",
      slug: "fiat-uno-2020-atibaia-sp",
      brand: "Fiat",
      model: "Uno",
      year: 2020,
      price: 35000,
      mileage: 45000,
      fuel_type: "Flex",
      transmission: "Manual",
      city: "Atibaia",
      state: "SP",
      status: "active",
      photo_urls: ["/mock/car-1.jpg"],
      title: "Fiat Uno 2020",
    },
    {
      id: "ad-2",
      slug: "vw-gol-2019-campinas-sp",
      brand: "VW",
      model: "Gol",
      year: 2019,
      price: 42000,
      mileage: 60000,
      fuel_type: "Flex",
      transmission: "Manual",
      city: "Campinas",
      state: "SP",
      status: "active",
      photo_urls: ["/mock/car-2.jpg"],
      title: "VW Gol 2019",
    },
    {
      id: "ad-3",
      slug: "chevrolet-onix-2021-sao-paulo-sp",
      brand: "Chevrolet",
      model: "Onix",
      year: 2021,
      price: 65000,
      mileage: 20000,
      fuel_type: "Flex",
      transmission: "Automático",
      city: "São Paulo",
      state: "SP",
      status: "active",
      photo_urls: ["/mock/car-3.jpg"],
      title: "Chevrolet Onix 2021",
    },
  ],

  facets: {
    brands: [
      { brand: "Fiat", total: 45 },
      { brand: "VW", total: 38 },
      { brand: "Chevrolet", total: 30 },
      { brand: "Toyota", total: 22 },
      { brand: "Honda", total: 18 },
      { brand: "Hyundai", total: 15 },
    ],
    models: [
      { brand: "Fiat", model: "Uno", total: 15 },
      { brand: "Fiat", model: "Argo", total: 12 },
      { brand: "VW", model: "Gol", total: 18 },
      { brand: "VW", model: "Polo", total: 10 },
      { brand: "Chevrolet", model: "Onix", total: 20 },
    ],
    fuelTypes: [
      { fuel_type: "Flex", total: 100 },
      { fuel_type: "Gasolina", total: 30 },
      { fuel_type: "Diesel", total: 15 },
    ],
    bodyTypes: [
      { body_type: "Hatch", total: 60 },
      { body_type: "Sedan", total: 40 },
      { body_type: "SUV", total: 25 },
    ],
  },

  plans: [
    { id: "free", name: "Grátis", price: 0, ads_limit: 3, duration_days: null },
    { id: "basic", name: "Básico", price: 29.9, ads_limit: 10, duration_days: 30 },
    { id: "pro", name: "Profissional", price: 79.9, ads_limit: 50, duration_days: 30 },
  ],

  cities: [
    { id: 1, name: "São Paulo", state: "SP", slug: "sao-paulo-sp" },
    { id: 2, name: "Campinas", state: "SP", slug: "campinas-sp" },
    { id: 3, name: "Atibaia", state: "SP", slug: "atibaia-sp" },
    { id: 4, name: "Sorocaba", state: "SP", slug: "sorocaba-sp" },
    { id: 5, name: "Rio de Janeiro", state: "RJ", slug: "rio-de-janeiro-rj" },
    { id: 6, name: "Belo Horizonte", state: "MG", slug: "belo-horizonte-mg" },
  ],

  fipe: {
    brands: [
      { code: "21", name: "Fiat" },
      { code: "59", name: "VW - VolksWagen" },
      { code: "23", name: "Chevrolet - GM" },
      { code: "56", name: "Toyota" },
      { code: "25", name: "Honda" },
    ],
    models: {
      "21": [
        { code: "4828", name: "Uno 1.0" },
        { code: "9590", name: "Argo 1.0" },
      ],
      "59": [
        { code: "5585", name: "Gol 1.0" },
        { code: "9080", name: "Polo 1.6" },
      ],
    } as Record<string, Array<{ code: string; name: string }>>,
    years: [
      { code: "2024-1", name: "2024 Gasolina" },
      { code: "2023-1", name: "2023 Gasolina" },
      { code: "2022-1", name: "2022 Gasolina" },
    ],
    quote: {
      fipeCode: "001004-9",
      brand: "Fiat",
      model: "Uno 1.0",
      year: 2022,
      fuel: "Gasolina",
      referenceMonth: "março de 2026",
      price: "R$ 38.500,00",
      priceNumber: 38500,
    },
  },
};
