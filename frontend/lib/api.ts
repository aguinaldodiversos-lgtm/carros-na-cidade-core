export async function getFeaturedCars() {
  return [
    {
      slug: "toyota-corolla-2023",
      title: "2023 Toyota Corolla",
      price: "R$ 112.900",
      image: "/images/corolla.jpeg",
      city: "São Paulo",
      state: "SP",
      sponsored: true,
    },
  ];
}

export async function getFipeDeals() {
  return [
    {
      slug: "honda-civic-2021",
      title: "2021 Honda Civic",
      price: "R$ 98.900",
      image: "/images/civic.jpeg",
      city: "São Paulo",
      state: "SP",
      discount: 8,
    },
  ];
}