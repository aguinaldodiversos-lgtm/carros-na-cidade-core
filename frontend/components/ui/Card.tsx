// frontend/components/ui/Card.tsx

import type { ReactNode, HTMLAttributes, ElementType } from "react";

/**
 * Card primitivo de container.
 * Variants:
 *   - default     → fundo branco + borda + sombra suave
 *   - elevated    → mais sombra, hover sobe
 *   - flat        → sem sombra, apenas borda
 *   - interactive → cursor pointer + hover (uso em link/clickable cards)
 *
 * Padding interno controlado via prop padding (none | sm | md | lg).
 *
 * Server Component — apenas composição.
 */

type CardVariant = "default" | "elevated" | "flat" | "interactive";
type CardPadding = "none" | "sm" | "md" | "lg";

export type CardProps<T extends ElementType = "div"> = {
  as?: T;
  variant?: CardVariant;
  padding?: CardPadding;
  fullWidth?: boolean;
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLElement>, "children" | "className">;

const VARIANT_CLASSES: Record<CardVariant, string> = {
  default: "bg-cnc-surface border border-cnc-line shadow-card",
  elevated:
    "bg-cnc-surface border border-cnc-line shadow-soft hover:shadow-premium transition-shadow",
  flat: "bg-cnc-surface border border-cnc-line",
  interactive:
    "bg-cnc-surface border border-cnc-line shadow-card hover:shadow-premium hover:-translate-y-0.5 transition cursor-pointer",
};

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 md:p-5",
  lg: "p-5 md:p-6",
};

export function Card<T extends ElementType = "div">({
  as,
  variant = "default",
  padding = "md",
  fullWidth = true,
  children,
  className = "",
  ...rest
}: CardProps<T>) {
  const Component = (as || "div") as ElementType;
  return (
    <Component
      className={`rounded-lg ${VARIANT_CLASSES[variant]} ${PADDING_CLASSES[padding]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {children}
    </Component>
  );
}
