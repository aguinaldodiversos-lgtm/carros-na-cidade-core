import CarCard from "@/components/ads/CarCard";

const fipe = [
  {
    title: "2022 Hyundai Creta",
    price: "R$ 89.900",
    image: "/images/vehicle-placeholder.svg",
    discount: "9%",
  },
  {
    title: "2021 Volkswagen T-Cross",
    price: "R$ 97.900",
    image: "/images/vehicle-placeholder.svg",
    discount: "9%",
  },
  {
    title: "2023 Nissan Kicks",
    price: "R$ 96.900",
    image: "/images/vehicle-placeholder.svg",
    discount: "9%",
  },
  {
    title: "2020 Chevrolet Onix",
    price: "R$ 65.900",
    image: "/images/vehicle-placeholder.svg",
    discount: "8%",
  },
];

export default function FipeSection() {
  return (
    <section className="max-w-6xl mx-auto px-6 mt-16">
      <h2 className="text-2xl font-bold mb-1">Oportunidades abaixo da FIPE</h2>

      <p className="text-gray-500 mb-8">Ofertas com preço abaixo do valor de mercado</p>

      <div className="grid md:grid-cols-4 gap-6">
        {fipe.map((car) => (
          <CarCard key={car.title} car={car} />
        ))}
      </div>
    </section>
  );
}
