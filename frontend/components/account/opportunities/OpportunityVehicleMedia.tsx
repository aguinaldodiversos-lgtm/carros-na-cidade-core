"use client";

import { useState } from "react";
import ActiveBuyerArt from "./ActiveBuyerArt";
import { artBodyTypeFor, type DealerOpportunity } from "@/lib/purchase-intents/api";

/**
 * Assets produzidos para o portal, sem vínculo com anúncios reais.
 * Não usar fotos do estoque, URLs externas nem assumir ano, cor ou versão.
 */
const MODEL_ILLUSTRATIONS = [
  {
    brand: "volkswagen",
    model: "virtus",
    src: "/images/oportunidades/modelos/volkswagen-virtus.svg",
  },
  {
    brand: "fiat",
    model: "pulse",
    src: "/images/oportunidades/modelos/fiat-pulse.svg",
  },
] as const;

function normalizeModelPart(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Match somente de marca + nome de modelo completo ou prefixo delimitado.
 * "Pulse Abarth" pode reutilizar a referência Pulse; "Pulseira" não.
 * Nunca consumir image_url/photos do DTO de uma oportunidade.
 */
export function resolveOpportunityModelIllustration(
  opportunity: Pick<DealerOpportunity, "intent_type" | "brand" | "model">
): string | null {
  if (opportunity.intent_type !== "specific_model") return null;

  const brand = normalizeModelPart(opportunity.brand);
  const model = normalizeModelPart(opportunity.model);
  const match = MODEL_ILLUSTRATIONS.find(
    (item) => brand === item.brand && (model === item.model || model.startsWith(`${item.model} `))
  );

  return match?.src ?? null;
}

export default function OpportunityVehicleMedia({
  opportunity,
}: {
  opportunity: DealerOpportunity;
}) {
  const src = resolveOpportunityModelIllustration(opportunity);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showModelArt = Boolean(src && failedSrc !== src);

  return (
    <div
      className="relative aspect-[320/132] w-full overflow-hidden rounded-xl bg-gradient-to-b from-[#edf5ff] via-[#f5f9ff] to-[#fff]"
      data-testid="active-buyer-media"
      data-media-kind={showModelArt ? "model" : "category"}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[8%] top-[18%] h-[78%] w-[84%] rounded-[50%] bg-[#dbeaff]/70 blur-xl"
      />
      {showModelArt && src ? (
        <>
          {/* Dimensões e proporção reservadas antes de carregar: sem CLS. */}
          <img
            src={src}
            alt={`Representação ilustrativa de ${opportunity.brand} ${opportunity.model}; não indica ano, versão nem veículo disponível.`}
            width={800}
            height={330}
            loading="lazy"
            decoding="async"
            className="relative z-[1] block h-full w-full object-contain"
            data-testid="active-buyer-model-image"
            onError={() => setFailedSrc(src)}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-2 z-[2] flex h-9 w-9 items-center justify-center rounded-full border border-[#e0eaff] bg-white/95 text-[#0e62d8] shadow-sm"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
            >
              <circle cx="10.8" cy="10.8" r="6.5" />
              <path d="m16 16 5 5" />
            </svg>
          </span>
        </>
      ) : (
        <ActiveBuyerArt
          bodyType={artBodyTypeFor(opportunity)}
          className="relative z-[1] block h-full w-full"
        />
      )}
      <span
        className="pointer-events-none absolute bottom-1 right-2 z-[2] rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-medium leading-none text-[#667085]"
        data-testid="active-buyer-image-disclaimer"
      >
        Imagem ilustrativa
      </span>
    </div>
  );
}
