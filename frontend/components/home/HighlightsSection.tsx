import CarCard from "@/components/ads/CarCard";

export default function HighlightsSection() {
  return (
    <section className="section">
      <h2>Destaques em São Paulo</h2>
      <p>Veículos patrocinados com maior visibilidade</p>

      <div className="grid">
        <CarCard title="2023 Toyota Corolla" price="R$ 112.900" />
        <CarCard title="2021 Honda Civic" price="R$ 98.900" />
        <CarCard title="2022 Jeep Compass" price="R$ 129.900" />
        <CarCard title="2020 Hyundai HB20" price="R$ 74.900" />
      </div>
    </section>
  );
}