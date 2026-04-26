// frontend/components/ui/Badge.tsx

import type { ReactNode } from "react";

/**
 * Badge primitivo (decorativo, não-interativo).
 * Variants: info | success | danger | warning | premium | neutral
 * Sizes: sm (xs) | md (sm)
 *
 * Server Component — não usa estado. Para hover/click use <Chip>.
 */

type BadgeVariant = "info" | "success" | "danger" | "warning" | "premium" | "neutral";
type BadgeSize = "sm" | "md";

export type BadgeProps = {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
  className?: string;
};

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  info: "bg-primary-soft text-primary-strong",
  success: "bg-cnc-success/10 text-cnc-success",
  danger: "bg-cnc-danger/10 text-cnc-danger",
  warning: "bg-cnc-warning/10 text-cnc-warning",
  premium: "bg-gradient-to-r from-cnc-footer-a to-cnc-footer-b text-white shadow-sm",
  neutral: "bg-cnc-bg text-cnc-text border border-cnc-line",
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: "h-5 px-2 text-[11px]",
  md: "h-6 px-2.5 text-xs",
};

export function Badge({ variant = "neutral", size = "sm", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wideish ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
    >
      {children}
    </span>
  );
}
