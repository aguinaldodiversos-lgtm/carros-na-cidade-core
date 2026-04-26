// frontend/components/vehicle/VehicleSpecs.tsx

import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";

/**
 * PR I — VehicleSpecs refatorado para tokens DS.
 * Organiza dados técnicos em cards/chips conforme regra 10 do PR I.
 *
 * Mantém a função (ficha técnica + descrição + listas), apenas troca
 * hex/sombras hardcoded por <Card>, <Chip variant="static"> e tokens
 * (cnc-line, cnc-text-strong, cnc-muted, primary).
 */

type VehicleSpecsProps = {
  vehicle: VehicleDetail;
  aiInsights: string[];
};

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-cnc-line bg-cnc-surface px-4 py-3 shadow-card">
      <p className="text-[11px] font-bold uppercase tracking-wideish text-cnc-muted">{label}</p>
      <p className="mt-1 text-base font-semibold leading-snug text-cnc-text-strong">{value}</p>
    </div>
  );
}

function ItemList({
  title,
  items,
  highlight = false,
}: {
  title: string;
  items: string[];
  highlight?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <Card
      variant="flat"
      padding="lg"
      as="article"
      className={highlight ? "bg-primary-soft" : ""}
    >
      <h3 className="text-base font-extrabold text-cnc-text-strong">{title}</h3>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item}>
            <Chip variant="static">{item}</Chip>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function VehicleSpecs({ vehicle, aiInsights }: VehicleSpecsProps) {
  const marketInsights = aiInsights.filter((item) => item && item.trim());

  return (
    <section className="space-y-5">
      <Card variant="elevated" padding="lg" as="article">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wideish text-primary">
              Ficha técnica
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-cnc-text-strong md:text-3xl">
              Dados do veículo
            </h2>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SpecRow label="Marca" value={vehicle.brand || "Não informado"} />
          <SpecRow label="Modelo" value={vehicle.model} />
          <SpecRow label="Versão" value={vehicle.version || "Não informada"} />
          <SpecRow label="Ano" value={vehicle.year} />
          <SpecRow label="Quilometragem" value={vehicle.km} />
          <SpecRow label="Combustível" value={vehicle.fuel} />
          <SpecRow label="Câmbio" value={vehicle.transmission} />
          <SpecRow label="Carroceria" value={vehicle.bodyType} />
          <SpecRow label="Cor" value={vehicle.color} />
          <SpecRow label="Local" value={vehicle.city} />
          <SpecRow label="FIPE" value={vehicle.fipePrice} />
          <SpecRow label="Código" value={vehicle.adCode} />
        </div>
      </Card>

      <Card variant="elevated" padding="lg" as="article">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-wideish text-primary">
              Descrição e diferenciais
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-cnc-text-strong md:text-3xl">
              Detalhes do anúncio
            </h2>
            <p className="mt-4 text-base leading-relaxed text-cnc-text">{vehicle.description}</p>
          </div>

          <Card variant="flat" padding="lg">
            <h3 className="text-base font-extrabold text-cnc-text-strong">Observações do vendedor</h3>
            <p className="mt-3 text-sm leading-relaxed text-cnc-muted">{vehicle.sellerNotes}</p>
          </Card>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-4">
        <ItemList title="Destaques" items={vehicle.optionalItems} />
        <ItemList title="Itens de segurança" items={vehicle.safetyItems} />
        <ItemList title="Conforto" items={vehicle.comfortItems} />
        {marketInsights.length > 0 ? (
          <ItemList title="Insights de mercado" items={marketInsights} highlight />
        ) : null}
      </div>
    </section>
  );
}
