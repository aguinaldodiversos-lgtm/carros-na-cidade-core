// frontend/components/ui/QuickActionTile.tsx

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Card retangular com ícone circular + título + chevron-right.
 *
 * Usado em blocos "quick actions" das páginas (ex.: na Home, abaixo dos
 * atalhos circulares: Anunciar grátis / Tabela FIPE / Simulador). Também
 * pode ser usado como CTA de bottom em FIPE/Simulador/Blog.
 *
 * Server Component — apenas Link + composição visual. Sem hex hardcoded:
 * usa tokens DS (cnc-surface, cnc-line, primary-soft, primary, cnc-text-strong,
 * cnc-muted).
 */

export type QuickActionTileProps = {
  href: string;
  title: string;
  /** Subtítulo curto opcional (1 linha). */
  subtitle?: string;
  icon: ReactNode;
  ariaLabel?: string;
  className?: string;
};

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-cnc-muted-soft"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function QuickActionTile({
  href,
  title,
  subtitle,
  icon,
  ariaLabel,
  className = "",
}: QuickActionTileProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel || title}
      className={`group flex items-center gap-3 rounded-2xl border border-cnc-line bg-cnc-surface p-3 shadow-card transition hover:border-primary/40 hover:shadow-premium sm:p-4 ${className}`}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary sm:h-12 sm:w-12"
      >
        <span className="flex h-5 w-5 items-center justify-center sm:h-6 sm:w-6">{icon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold leading-tight text-cnc-text-strong sm:text-[15px]">
          {title}
        </span>
        {subtitle ? (
          <span className="block truncate text-[12px] leading-snug text-cnc-muted sm:text-[13px]">
            {subtitle}
          </span>
        ) : null}
      </div>
      <ChevronRightIcon />
    </Link>
  );
}
