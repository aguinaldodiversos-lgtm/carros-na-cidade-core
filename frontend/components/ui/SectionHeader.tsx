// frontend/components/ui/SectionHeader.tsx

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Cabeçalho de seção: título + ícone opcional + link "ver todos" opcional.
 * Variants: default | with-icon | compact
 *
 * Server Component.
 */

type SectionHeaderVariant = "default" | "with-icon" | "compact";

export type SectionHeaderProps = {
  title: ReactNode;
  variant?: SectionHeaderVariant;
  icon?: ReactNode;
  description?: ReactNode;
  seeAllHref?: string;
  seeAllLabel?: string;
  className?: string;
  /** Nível do heading (h2 default, ajustar para hierarquia correta da página). */
  as?: "h2" | "h3" | "h4";
};

const TITLE_CLASSES: Record<SectionHeaderVariant, string> = {
  default: "text-xl font-bold tracking-tight text-cnc-text-strong md:text-2xl",
  "with-icon": "text-xl font-bold tracking-tight text-cnc-text-strong md:text-2xl",
  compact: "text-base font-semibold text-cnc-text-strong",
};

export function SectionHeader({
  title,
  variant = "default",
  icon,
  description,
  seeAllHref,
  seeAllLabel = "Ver todos",
  className = "",
  as: Heading = "h2",
}: SectionHeaderProps) {
  return (
    <header
      className={`flex items-center justify-between gap-3 ${className}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {variant === "with-icon" && icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <Heading className={`${TITLE_CLASSES[variant]} truncate`}>{title}</Heading>
          {description && (
            <p className="mt-0.5 truncate text-sm text-cnc-muted">{description}</p>
          )}
        </div>
      </div>
      {seeAllHref && (
        <Link
          href={seeAllHref}
          className="shrink-0 text-sm font-semibold text-primary hover:text-primary-strong"
        >
          {seeAllLabel}
          <span aria-hidden="true" className="ml-1">
            →
          </span>
        </Link>
      )}
    </header>
  );
}
