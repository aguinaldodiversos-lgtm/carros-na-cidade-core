import type { VehicleDetail } from "@/services/vehicleService";

type VehicleSpecsProps = {
  vehicle: VehicleDetail;
  aiInsights: string[];
};

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="rounded-xl border border-[#e1e5ef] bg-[#f8fafe] p-4">
      <h3 className="text-base font-extrabold text-[#1f2a43]">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-[#4e5870]">
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

export default function VehicleSpecs({ vehicle, aiInsights }: VehicleSpecsProps) {
  return (
    <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
      <h2 className="text-2xl font-extrabold text-[#1d2538]">Descricao completa</h2>
      <p className="mt-2 text-sm leading-relaxed text-[#4f5a72]">{vehicle.description}</p>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <ListCard title="Opcionais" items={vehicle.optionalItems} />
        <ListCard title="Itens de seguranca" items={vehicle.safetyItems} />
        <ListCard title="Conforto" items={vehicle.comfortItems} />
      </div>

      <article className="mt-4 rounded-xl border border-[#e1e5ef] bg-[#f8fafe] p-4">
        <h3 className="text-base font-extrabold text-[#1f2a43]">Observacoes do vendedor</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#4f5a72]">{vehicle.sellerNotes}</p>
      </article>

      <article className="mt-4 rounded-xl border border-[#d9e5ff] bg-[#edf4ff] p-4">
        <h3 className="text-base font-extrabold text-[#1f2a43]">Insights de mercado do Cerebro IA</h3>
        <ul className="mt-2 space-y-1 text-sm text-[#4e5870]">
          {aiInsights.map((insight) => (
            <li key={insight} className="inline-flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[#0e62d8]" />
              {insight}
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
