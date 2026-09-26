import Link from "next/link";

import type { ModelLandingLink } from "@/lib/buy/model-landing";

/**
 * "Explorar em {cidade}" — links internos da landing, Server Component.
 *
 * `<a href>` de verdade (via `next/link`): é navegação para o comprador e
 * caminho de rastreamento para o Google (Cidade → Marca → Modelo → Veículo).
 * Nunca botão sem `href`.
 *
 * Montado DUAS vezes pela página: na sidebar (desktop) e depois da listagem
 * (mobile, onde a sidebar é uma gaveta fechada). `headingId` separa os dois
 * `aria-labelledby`.
 */

type ModelLandingExploreProps = {
  cityName: string;
  links: ModelLandingLink[];
  headingId: string;
  className?: string;
};

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

export function ModelLandingExplore({
  cityName,
  links,
  headingId,
  className = "",
}: ModelLandingExploreProps) {
  if (!links.length) return null;

  return (
    <nav
      aria-labelledby={headingId}
      data-testid="model-landing-explore"
      className={`rounded-2xl border border-primary/15 bg-primary-soft/70 p-5 ${className}`}
    >
      <h2
        id={headingId}
        className="flex items-center gap-2 text-[17px] font-bold text-cnc-text-strong"
      >
        <PinIcon />
        Explorar em {cityName}
      </h2>
      <ul className="mt-3 space-y-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="inline-flex min-h-[40px] items-center gap-2 py-1.5 text-[14.5px] font-semibold text-primary transition hover:text-primary-strong hover:underline motion-reduce:transition-none"
            >
              {link.label}
              <ArrowIcon />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
