// frontend/components/vehicle/VehicleTrustPanel.tsx

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SITE_CONTACT, SITE_ROUTES } from "@/lib/site/site-navigation";
import { toAbsoluteUrl } from "@/lib/seo/site";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";

/**
 * PR I — VehicleTrustPanel para tokens DS.
 * Bloco de confiança ao lado da galeria/CTAs no detalhe.
 * Mantém função e mailto de denúncia; troca hex por tokens.
 */

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
    <Card variant="default" padding="lg" as="section" aria-labelledby="trust-panel-heading">
      <h2
        id="trust-panel-heading"
        className="text-base font-extrabold tracking-wide text-cnc-text-strong"
      >
        Dicas de segurança na negociação
      </h2>

      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-cnc-text">
        {bullets.map((line) => (
          <li key={line} className="flex gap-2">
            <span
              aria-hidden="true"
              className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-3 border-t border-cnc-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={SITE_ROUTES.seguranca}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-primary transition hover:text-primary-strong"
        >
          <span aria-hidden="true">→</span>
          Ver guia completo de negociação segura
        </Link>

        <Button href={reportHref} variant="secondary" size="md">
          Reportar este anúncio
        </Button>
      </div>
    </Card>
  );
}
