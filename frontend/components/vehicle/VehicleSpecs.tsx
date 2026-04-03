import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";

type VehicleSpecsProps = {
  vehicle: VehicleDetail;
  aiInsights: string[];
};

function ListCard({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: string[];
  tone?: "default" | "highlight";
}) {
  return (
    <article
      className={`rounded-[24px] border p-5 ${
        tone === "highlight" ? "border-[#d9e5ff] bg-[#edf4ff]" : "border-[#e1e5ef] bg-[#f8fafe]"
      }`}
    >
      <h3 className="text-base font-extrabold text-[#1f2a43]">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-[#4e5870]">
        {items.map((item) => (
          <li key={item} className="inline-flex items-start gap-2">
            <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[#0e62d8]" />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}

function SpecCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[#e6ebf2] bg-white px-4 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#7b869d]">{label}</p>
      <p className="mt-1 text-[16px] font-semibold leading-snug text-[#1d2538]">{value}</p>
    </div>
  );
}

export default function VehicleSpecs({ vehicle, aiInsights }: VehicleSpecsProps) {
  return (
    <section className="space-y-5">
      <article className="rounded-[28px] border border-[#dfe4ef] bg-white p-5 shadow-[0_12px_32px_rgba(10,20,40,0.05)] md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#0e62d8]">
              Ficha técnica
            </p>
            <h2 className="mt-2 text-[28px] font-extrabold tracking-[-0.02em] text-[#1d2538]">
              Dados organizados para leitura rápida
            </h2>
          </div>
          <p className="max-w-2xl text-[14px] leading-7 text-[#5d6880]">
            Estrutura preparada para escalar com mais atributos do backend sem transformar a página
            em um bloco monolítico.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SpecCard label="Marca" value={vehicle.brand || "Não informado"} />
          <SpecCard label="Modelo" value={vehicle.model} />
          <SpecCard label="Versão" value={vehicle.version || "Não informada"} />
          <SpecCard label="Ano" value={vehicle.year} />
          <SpecCard label="Quilometragem" value={vehicle.km} />
          <SpecCard label="Combustível" value={vehicle.fuel} />
          <SpecCard label="Câmbio" value={vehicle.transmission} />
          <SpecCard label="Carroceria" value={vehicle.bodyType} />
          <SpecCard label="Cor" value={vehicle.color} />
          <SpecCard label="Local" value={vehicle.city} />
          <SpecCard label="FIPE" value={vehicle.fipePrice} />
          <SpecCard label="Código" value={vehicle.adCode} />
        </div>
      </article>

      <article className="rounded-[28px] border border-[#dfe4ef] bg-white p-5 shadow-[0_12px_32px_rgba(10,20,40,0.05)] md:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#0e62d8]">
              Descrição e diferenciais
            </p>
            <h2 className="mt-2 text-[28px] font-extrabold tracking-[-0.02em] text-[#1d2538]">
              Leitura editorial e comercial
            </h2>
            <p className="mt-4 text-[15px] leading-8 text-[#4f5a72]">{vehicle.description}</p>
          </div>

          <article className="rounded-[24px] border border-[#e1e5ef] bg-[#f8fafe] p-5">
            <h3 className="text-base font-extrabold text-[#1f2a43]">Observações do vendedor</h3>
            <p className="mt-3 text-sm leading-7 text-[#4f5a72]">{vehicle.sellerNotes}</p>
          </article>
        </div>
      </article>

      <div className="grid gap-4 xl:grid-cols-4">
        <ListCard title="Opcionais" items={vehicle.optionalItems} />
        <ListCard title="Itens de segurança" items={vehicle.safetyItems} />
        <ListCard title="Conforto" items={vehicle.comfortItems} />
        <ListCard
          title="Insights de mercado do Cérebro IA"
          items={aiInsights}
          tone="highlight"
        />
      </div>
    </section>
  );
}
