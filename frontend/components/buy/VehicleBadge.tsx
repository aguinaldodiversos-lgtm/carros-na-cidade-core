import type { HTMLAttributes } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Selos do catálogo — variantes alinhadas a um design system leve (contraste, leitura rápida).
 */
export type VehiclePrimaryBadgeVariant = "destaque" | "loja_premium" | "loja" | "anuncio";

export type VehicleAuxiliaryBadgeVariant = "below_fipe";

const primaryVariants: Record<VehiclePrimaryBadgeVariant, string> = {
  destaque:
    "bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-[0_2px_8px_rgba(14,98,216,0.35)]",
  loja_premium: "bg-slate-900 text-white shadow-sm",
  loja: "bg-white/95 text-blue-800 ring-1 ring-blue-100 shadow-sm backdrop-blur-sm",
  anuncio: "bg-slate-100/95 text-slate-700 ring-1 ring-slate-200/90",
};

const auxiliaryVariants: Record<VehicleAuxiliaryBadgeVariant, string> = {
  below_fipe: "bg-blue-700 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white",
};

export function primaryBadgeFromWeight(weight: 1 | 2 | 3 | 4): VehiclePrimaryBadgeVariant {
  if (weight === 4) return "destaque";
  if (weight === 3) return "loja_premium";
  if (weight === 2) return "loja";
  return "anuncio";
}

export function VehiclePrimaryBadge({
  variant,
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { variant: VehiclePrimaryBadgeVariant }) {
  return (
    <span
      className={cx(
        "inline-flex max-w-[min(100%,11rem)] items-center rounded-[10px] px-2.5 py-1 text-[11px] font-extrabold leading-tight",
        primaryVariants[variant],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

export function VehicleBelowFipeBadge({
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx(
        "inline-flex rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide shadow-sm",
        auxiliaryVariants.below_fipe,
        className
      )}
      {...rest}
    >
      Abaixo da FIPE
    </span>
  );
}

export function primaryBadgeLabel(variant: VehiclePrimaryBadgeVariant): string {
  switch (variant) {
    case "destaque":
      return "Destaque";
    case "loja_premium":
      return "Loja Premium";
    case "loja":
      return "Loja";
    default:
      return "Patrocinado";
  }
}
