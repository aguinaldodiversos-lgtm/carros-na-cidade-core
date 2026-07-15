"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import FinancingSimulator, {
  type SimulationResult,
} from "@/components/financing/FinancingSimulator";
import { trackAdEvent } from "@/lib/analytics/public-events";
import { buildFinanceLink, buildVehicleWhatsappHref } from "@/lib/vehicle/detail-utils";

/**
 * Simulador embutido na página do anúncio. Reúne o núcleo compartilhado
 * `FinancingSimulator` (valor fixo = preço do anúncio) + um CTA de WhatsApp
 * logo abaixo do resultado — para o comprador emendar o contato no momento de
 * maior intenção, sem rolar de volta ao topo. O texto do WhatsApp já vem com a
 * simulação atual (prazo/parcela/entrada), dando ao lojista um lead com
 * intenção e capacidade declaradas. Usado no desktop e no mobile.
 */

function WhatsappIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.16c-.24.68-1.42 1.3-1.95 1.34-.5.05-.5.4-3.15-.66-2.65-1.06-4.3-3.77-4.43-3.95-.13-.18-1.06-1.41-1.06-2.69 0-1.28.67-1.9.91-2.17.24-.26.53-.33.7-.33.18 0 .35 0 .5.01.16.01.38-.06.59.45.24.58.81 2 .88 2.15.07.14.12.31.02.5-.09.18-.14.29-.28.45-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.93 1.94 1.22 2.22 1.36.28.14.44.12.6-.07.18-.2.69-.8.87-1.08.18-.28.36-.23.6-.14.24.09 1.55.73 1.81.87.27.14.44.2.5.31.07.11.07.63-.17 1.31Z" />
    </svg>
  );
}

function formatBRL0(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

type VehicleFinancingSimulatorProps = {
  vehicleId: string;
  citySlug: string;
  vehicleName: string;
  vehiclePriceNumeric?: number | null;
  /** Telefone/WhatsApp do lojista (mesma fonte dos botões de contato). */
  sellerPhone?: string | null;
};

export default function VehicleFinancingSimulator({
  vehicleId,
  citySlug,
  vehicleName,
  vehiclePriceNumeric,
  sellerPhone,
}: VehicleFinancingSimulatorProps) {
  const [sim, setSim] = useState<SimulationResult | null>(null);

  const whatsappHref = useMemo(() => {
    const note =
      sim && sim.installment > 0
        ? `Simulei ${sim.term}x de ${formatBRL0(sim.installment)} com ${formatBRL0(
            sim.downPayment
          )} de entrada.`
        : null;
    return buildVehicleWhatsappHref({ phone: sellerPhone, vehicleName, note });
  }, [sim, sellerPhone, vehicleName]);

  // Sem preço real não há o que simular (o valor é o preço do anúncio, fixo).
  if (vehiclePriceNumeric == null || vehiclePriceNumeric <= 0) return null;

  const seeMoreHref = buildFinanceLink(vehicleId, citySlug, vehiclePriceNumeric);

  return (
    <section aria-label="Simule a parcela deste carro">
      <h2 className="text-[18px] font-extrabold tracking-tight text-cnc-text-strong sm:text-[20px]">
        Simule a parcela deste carro
      </h2>
      <p className="mt-1 text-[13.5px] text-cnc-muted">
        O valor é o preço do anúncio. Ajuste entrada, prazo e taxa para ver a parcela.
      </p>

      <div className="mt-4">
        <FinancingSimulator
          initialVehicleValue={vehiclePriceNumeric}
          valueEditable={false}
          onResultChange={setSim}
        />
      </div>

      {/* CTA de contato NO PRÓPRIO bloco — não obriga a rolar de volta ao topo. */}
      <a
        href={whatsappHref ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!whatsappHref}
        onClick={(e) => {
          if (!whatsappHref) {
            e.preventDefault();
            return;
          }
          trackAdEvent(vehicleId, "whatsapp").catch(() => {});
        }}
        className={`mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1ea860] text-[15px] font-bold text-white shadow-card transition hover:bg-[#178a4f] ${
          whatsappHref ? "" : "pointer-events-none opacity-60"
        }`}
      >
        <WhatsappIcon />
        Enviar simulação no WhatsApp
      </a>

      {/* Descoberta/SEO: link discreto para o simulador completo da cidade. */}
      <div className="mt-3 text-center">
        <Link
          href={seeMoreHref}
          className="text-[13px] font-semibold text-primary hover:text-primary-strong"
        >
          Ver mais carros que cabem nessa parcela
        </Link>
      </div>
    </section>
  );
}
