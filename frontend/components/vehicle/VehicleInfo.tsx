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
    label: safeText(priceSignal?.label, "") || "Análise em processamento pelo Cérebro IA",
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
    <div className="rounded-2xl border border-[#e6ebf2] bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#7b869d]">{label}</p>
      <p className="mt-1 text-[15px] font-semibold leading-snug text-[#2a3550]">{value}</p>
    </div>
  );
}

export default function VehicleInfo({ vehicle, priceSignal }: VehicleInfoProps) {
  const headline = buildHeadline(vehicle);
  const signal = buildPriceSignal(priceSignal);
  const dateLabels = formatListingDateLabels(vehicle.adPublishedAt, vehicle.adUpdatedAt);
  const fipeDelta = formatFipeDelta(vehicle);

  return (
    <section className="rounded-[28px] border border-[#e1e7f0] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)] md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#eef5ff] px-3 py-1 text-[12px] font-bold text-[#0e62d8]">
              {safeText(vehicle.city, "Região")}
            </span>
            <span className="inline-flex items-center rounded-full bg-[#f5f7fb] px-3 py-1 text-[12px] font-semibold text-[#5f6982]">
              Código {safeText(vehicle.adCode, safeText(vehicle.id, "N/D"))}
            </span>
            {vehicle.isBelowFipe ? (
              <span className="inline-flex items-center rounded-full bg-[#1f8a4a] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white">
                Oportunidade abaixo da FIPE
              </span>
            ) : null}
          </div>

          <h1 className="mt-4 max-w-5xl text-[31px] font-extrabold leading-[1.08] tracking-[-0.03em] text-[#1d2538] md:text-[46px]">
            {headline}
          </h1>

          <p className="mt-3 max-w-4xl text-[15px] leading-7 text-[#5d6880]">
            Página premium com dados claros, contexto territorial e canais de contato consistentes
            para apoiar uma negociação mais segura e profissional.
          </p>
        </div>

        <div className="rounded-[24px] border border-[#d9e5ff] bg-[#f3f7ff] p-4 lg:max-w-[360px]">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#0c57c8]">
            Indicador do Cérebro IA
          </p>
          <p className="mt-1 text-[18px] font-extrabold leading-tight text-[#1e2f53]">{signal.label}</p>
          <p className="mt-2 text-[14px] leading-6 text-[#435372]">{signal.reason}</p>
        </div>
      </div>

      {fipeDelta ? (
        <div
          className={`mt-5 rounded-[22px] border px-4 py-4 text-[14px] leading-relaxed ${
            fipeDelta.tone === "below"
              ? "border-[#ccebd7] bg-[#f3fbf6] text-[#166534]"
              : fipeDelta.tone === "above"
                ? "border-[#f3d7c6] bg-[#fff7f1] text-[#9a3412]"
                : "border-[#e4e8f0] bg-[#fafbfd] text-[#5c667a]"
          }`}
        >
          <p className="font-bold">{fipeDelta.line}</p>
          <p className="mt-1 text-[13px] text-[#5d6880]">
            Referência estimada: {safeText(vehicle.fipePrice, "Consulte")} para apoio de negociação
            e leitura comercial do anúncio.
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-1 text-[13px] text-[#5c667a]">
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

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <SpecPill label="Condição" value={safeText(vehicle.condition)} />
        <SpecPill label="Ano" value={safeYearLabel(vehicle.year)} />
        <SpecPill label="Quilometragem" value={safeText(vehicle.km)} />
        <SpecPill label="Combustível" value={safeText(vehicle.fuel)} />
        <SpecPill label="Câmbio" value={safeText(vehicle.transmission)} />
        <SpecPill label="Carroceria" value={safeText(vehicle.bodyType)} />
        <SpecPill label="Cor" value={safeText(vehicle.color)} />
        <SpecPill label="Referência FIPE" value={safeText(vehicle.fipePrice, "Consulte")} />
      </div>
    </section>
  );
}
