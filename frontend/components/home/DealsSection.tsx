import CarCard from "@/components/ads/CarCard";

export default function DealsSection() {
  return (
    <section className="section">
      <h2>Oportunidades abaixo da FIPE</h2>
      <p>Ofertas com preço abaixo do valor de mercado</p>

      <div className="grid">
        <CarCard title="2022 Hyundai Creta" price="R$ 89.900" />
        <CarCard title="2021 Volkswagen T-Cross" price="R$ 97.900" />
        <CarCard title="2023 Nissan Kicks" price="R$ 96.900" />
        <CarCard title="2020 Chevrolet Onix" price="R$ 65.900" />
      </div>
    </section>
  );
}
