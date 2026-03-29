import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";
import { formatListingDateLabels } from "@/lib/vehicle/public-vehicle";
import type { VehiclePriceSignal } from "@/services/aiService";

type VehicleInfoProps = {
  vehicle: VehicleDetail;
  priceSignal?: VehiclePriceSignal | null;
};

function safeText(value: unknown, fallback = "Não informado") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeYearLabel(value: unknown) {
  const raw = safeText(value, "");
  if (!raw) return "Ano não informado";
  return raw;
}

function primaryYear(value: unknown) {
  const raw = safeYearLabel(value);
  if (!raw || raw === "Ano não informado") return "Ano não informado";
  return raw.split("/")[0] || raw;
}

function buildHeadline(vehicle: VehicleDetail) {
  const fullName = safeText(vehicle.fullName, "");
  const model = safeText(vehicle.model, "Veículo");
  const city = safeText(vehicle.city, "sua região");
  const titleBase = fullName || model;
  const year = primaryYear(vehicle.year);

  if (year === "Ano não informado") {
    return `${titleBase} à venda em ${city}`;
  }

  if (titleBase.toLowerCase().includes(year.toLowerCase())) {
    return `${titleBase} à venda em ${city}`;
  }

  return `${titleBase} ${year} à venda em ${city}`;
}

function buildPriceSignal(priceSignal?: VehiclePriceSignal | null) {
  return {
    label:
      safeText(priceSignal?.label, "") || "Análise em processamento pelo Cérebro IA",
    reason:
      safeText(priceSignal?.reason, "") ||
      "Estamos consolidando sinais de preço, contexto regional e comportamento de mercado para este anúncio.",
  };
}

function formatBrlAbs(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
}

function formatFipeDelta(vehicle: VehicleDetail) {
  const brl = vehicle.fipeDeltaBrl;
  const pct = vehicle.fipeDeltaPercent;
  if (brl == null || pct == null || !Number.isFinite(brl) || !Number.isFinite(pct)) {
    return null;
  }

  const absPct = Math.abs(pct).toFixed(1).replace(".", ",");
  if (brl < 0) {
    return {
      tone: "below" as const,
      line: `${formatBrlAbs(brl)} abaixo da referência FIPE estimada (${absPct}%)`,
    };
  }
  if (brl > 0) {
    return {
      tone: "above" as const,
      line: `${formatBrlAbs(brl)} acima da referência FIPE estimada (${absPct}%)`,
    };
  }
  return {
    tone: "neutral" as const,
    line: "Alinhado à referência FIPE estimada para o modelo.",
  };
}

function SpecPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e1e5ef] bg-[#f8fafe] px-3 py-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#6a748d]">
        {label}
      </p>
      <p className="mt-0.5 text-[15px] font-semibold leading-snug text-[#2a3550]">{value}</p>
    </div>
  );
}

export default function VehicleInfo({
  vehicle,
  priceSignal,
}: VehicleInfoProps) {
  const headline = buildHeadline(vehicle);
  const signal = buildPriceSignal(priceSignal);
  const dateLabels = formatListingDateLabels(vehicle.adPublishedAt, vehicle.adUpdatedAt);
  const fipeDelta = formatFipeDelta(vehicle);

  return (
    <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
      <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#6b768c]">
        {safeText(vehicle.city, "Região")}
      </p>

      <h1 className="mt-2 text-[26px] font-extrabold leading-[1.12] tracking-[-0.02em] text-[#1d2538] md:text-[38px]">
        {headline}
      </h1>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-[#eef1f6] pb-5">
        <p className="text-[32px] font-extrabold leading-none text-[#0e62d8] sm:text-[40px]">
          {safeText(vehicle.price, "R$ 0")}
        </p>

        {vehicle.isBelowFipe ? (
          <span className="inline-flex items-center rounded-full bg-[#1f8a4a] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white">
            Abaixo da FIPE
          </span>
        ) : null}
      </div>

      {fipeDelta ? (
        <p
          className={`mt-3 text-[13px] font-semibold leading-relaxed ${
            fipeDelta.tone === "below"
              ? "text-[#166534]"
              : fipeDelta.tone === "above"
                ? "text-[#9a3412]"
                : "text-[#5c667a]"
          }`}
        >
          {fipeDelta.line}
          <span className="mt-1 block text-[12px] font-normal text-[#6b768c]">
            Referência estimada: {safeText(vehicle.fipePrice, "Consulte")} — comparação aproximada
            para negociação; confira a tabela oficial para o modelo.
          </span>
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-1 text-[13px] text-[#5c667a]">
        <p>
          <span className="font-semibold text-[#3d4a63]">Código do anúncio:</span>{" "}
          {safeText(vehicle.adCode, safeText(vehicle.id, "N/D"))}
        </p>
        {dateLabels.primary ? (
          <p>
            {dateLabels.primary}
            {dateLabels.secondary ? (
              <>
                {" "}
                <span className="text-[#8b94a6]">·</span> {dateLabels.secondary}
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-[#8b94a6]">
            Data de publicação será exibida quando disponível na base de anúncios.
          </p>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-[15px] font-extrabold text-[#1d2538]">Ficha rápida</h2>
        <p className="mt-1 text-[13px] text-[#6b768c]">
          Dados principais do veículo — confirme opcionais e revisão com o anunciante.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <SpecPill label="Condição" value={safeText(vehicle.condition)} />
          <SpecPill label="Ano" value={safeYearLabel(vehicle.year)} />
          <SpecPill label="Quilometragem" value={safeText(vehicle.km)} />
          <SpecPill label="Combustível" value={safeText(vehicle.fuel)} />
          <SpecPill label="Câmbio" value={safeText(vehicle.transmission)} />
          <SpecPill label="Cor" value={safeText(vehicle.color)} />
          <SpecPill label="Local" value={safeText(vehicle.city)} />
          <SpecPill label="Referência FIPE" value={safeText(vehicle.fipePrice, "Consulte")} />
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[#d9e5ff] bg-[#edf4ff] p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#0c57c8]">
          Indicador do Cérebro IA
        </p>
        <p className="mt-1 text-base font-extrabold text-[#1e2f53]">{signal.label}</p>
        <p className="mt-1 text-sm leading-6 text-[#435372]">{signal.reason}</p>
      </div>
    </section>
  );
}
