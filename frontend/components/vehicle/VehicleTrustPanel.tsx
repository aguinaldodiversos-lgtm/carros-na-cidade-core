import Link from "next/link";

import { SITE_CONTACT, SITE_ROUTES } from "@/lib/site/site-navigation";
import { toAbsoluteUrl } from "@/lib/seo/site";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";

type VehicleTrustPanelProps = {
  vehicle: VehicleDetail;
};

function buildReportMailto(vehicle: VehicleDetail) {
  const pageUrl = toAbsoluteUrl(`/veiculo/${vehicle.slug}`);
  const subject = `Denúncia de anúncio — código ${vehicle.adCode}`;
  const body = [
    `Olá,`,
    ``,
    `Gostaria de reportar o seguinte anúncio:`,
    `- Veículo: ${vehicle.fullName}`,
    `- Código: ${vehicle.adCode}`,
    `- Link: ${pageUrl}`,
    ``,
    `Motivo (descreva com calma):`,
    ``,
  ].join("\n");

  return `mailto:${SITE_CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const DEFAULT_SAFETY_BULLETS = [
  "Prefira ver o veículo pessoalmente e confira documentação antes de pagar qualquer valor.",
  'Desconfie de ofertas muito abaixo do mercado e de pedidos de adiantamento por PIX para "reservar" sem contrato.',
  "Use o contato pelo portal e mantenha registro das conversas.",
];

export default function VehicleTrustPanel({ vehicle }: VehicleTrustPanelProps) {
  const reportHref = buildReportMailto(vehicle);
  const fromVehicle = Array.isArray(vehicle.safetyItems) ? vehicle.safetyItems : [];
  const bullets = fromVehicle.length > 0 ? fromVehicle : DEFAULT_SAFETY_BULLETS;

  return (
    <section
      className="rounded-2xl border border-[#e8ecf4] bg-gradient-to-br from-[#fafbfd] to-[#f4f7fc] p-5 shadow-[0_2px_16px_rgba(10,20,40,0.04)]"
      aria-labelledby="trust-panel-heading"
    >
      <h2
        id="trust-panel-heading"
        className="text-[15px] font-extrabold tracking-wide text-[#1d2538]"
      >
        Dicas de segurança na negociação
      </h2>

      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#4a5569]">
        {bullets.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#0e62d8]" />
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-3 border-t border-[#e1e7f0] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={SITE_ROUTES.seguranca}
          className="inline-flex items-center gap-2 text-sm font-bold text-[#0e62d8] transition hover:text-[#0b54be]"
        >
          <span aria-hidden="true">→</span>
          Ver guia completo de negociação segura
        </Link>

        <a
          href={reportHref}
          className="inline-flex items-center justify-center rounded-xl border border-[#d7deeb] bg-white px-4 py-2.5 text-sm font-bold text-[#3d4a63] shadow-sm transition hover:border-[#b8c4da] hover:bg-[#fafbfd]"
        >
          Reportar este anúncio
        </a>
      </div>
    </section>
  );
}
