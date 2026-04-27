// frontend/components/ui/ActionShortcut.tsx

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Atalho circular tipo "stories" (visualmente; sem mecânica de FOMO).
 *
 * Usado na home e seções de descoberta para levar a categorias/funções
 * úteis (Comprar, Vender, Blog, Ofertas, Lojas, Favoritos, etc.).
 *
 * Variants — alinhados ao mockup `pagina Home.png` que usa anéis
 * coloridos distintos para diferenciar cada atalho à primeira vista:
 *   - default   → azul (Comprar) — primary do DS
 *   - teal      → ciano/turquesa (Vender)
 *   - violet    → roxo (Blog)
 *   - highlight → laranja/vermelho (Ofertas) — anel "flame"
 *   - fuchsia   → magenta (Lojas)
 *   - sky       → azul claro (Favoritos)
 *   - muted     → cinza neutro (uso secundário)
 *
 * Server Component — apenas Link + composição visual.
 *
 * IMPORTANTE: este componente é um padrão visual. Não há badge "NOVO"
 * permanente nem contador — manter neutro para não cair no padrão de
 * manipulação tipo Instagram. Se "novo" precisa ser sinalizado, usar
 * Badge externamente.
 */

type ActionShortcutVariant =
  | "default"
  | "teal"
  | "violet"
  | "highlight"
  | "fuchsia"
  | "sky"
  | "muted";

export type ActionShortcutProps = {
  href: string;
  label: string;
  icon: ReactNode;
  variant?: ActionShortcutVariant;
  ariaLabel?: string;
  /** Pequena legenda secundária abaixo do label (ex: "12 ofertas"). */
  hint?: string;
  className?: string;
};

const RING_CLASSES: Record<ActionShortcutVariant, string> = {
  default: "ring-2 ring-primary/50 bg-white text-primary",
  teal: "ring-2 ring-cyan-400/70 bg-white text-cyan-600",
  violet: "ring-2 ring-violet-500/60 bg-white text-violet-600",
  highlight:
    "ring-2 ring-orange-400/70 bg-gradient-to-br from-orange-100 to-rose-100 text-orange-600",
  fuchsia: "ring-2 ring-fuchsia-500/60 bg-white text-fuchsia-600",
  sky: "ring-2 ring-sky-300/70 bg-white text-sky-500",
  muted: "ring-2 ring-cnc-line bg-cnc-bg text-cnc-muted",
};

export function ActionShortcut({
  href,
  label,
  icon,
  variant = "default",
  ariaLabel,
  hint,
  className = "",
}: ActionShortcutProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel || label}
      className={`flex w-16 shrink-0 flex-col items-center gap-1.5 text-center md:w-20 ${className}`}
    >
      <span
        className={`flex h-16 w-16 items-center justify-center rounded-full transition group-hover:scale-105 md:h-20 md:w-20 ${RING_CLASSES[variant]}`}
      >
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center md:h-8 md:w-8">
          {icon}
        </span>
      </span>
      <span className="block w-full text-[11px] font-semibold leading-tight text-cnc-text md:text-xs">
        {label}
      </span>
      {hint && (
        <span className="block w-full text-[10px] leading-tight text-cnc-muted">{hint}</span>
      )}
    </Link>
  );
}
