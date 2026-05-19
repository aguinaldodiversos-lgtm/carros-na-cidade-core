// frontend/components/home/sections/HomeShortcuts.tsx

import Link from "next/link";

/**
 * Quick actions — 5 atalhos circulares azuis conforme contrato visual
 * `atualização-home.png` (revisão 2026-05-19).
 *
 * Items: Comprar, Vender, FIPE, Ofertas, Planos.
 * Ícones brancos sobre círculo azul sólido (#2563EB).
 *
 * Layout responsivo:
 *   • Mobile (< sm): cada item `flex-1` para distribuir uniformemente
 *     em qualquer largura de viewport (360–639px). Círculos h-14 w-14
 *     (56px) para caber confortavelmente em 360px.
 *   • Desktop (sm+): círculos h-16 w-16 (64px), gaps maiores.
 *
 * Server Component — apenas composição estática.
 */

function CarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-6 w-6 sm:h-7 sm:w-7"
    >
      <path d="M5 11V14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3l-1.9-4.8A1 1 0 0 0 16.2 6H7.8a1 1 0 0 0-.93.62L5 11Z" />
      <path d="M5 11h14" />
      <circle cx="8.5" cy="15" r="1.5" fill="white" stroke="none" />
      <circle cx="15.5" cy="15" r="1.5" fill="white" stroke="none" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-6 w-6 sm:h-7 sm:w-7"
    >
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8 8a2 2 0 0 0 2.828 0l7.172-7.172a2 2 0 0 0 0-2.828l-8-8Z" />
      <circle cx="7.5" cy="7.5" r="1.5" fill="white" stroke="none" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-6 w-6 sm:h-7 sm:w-7"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fontSize="5.5"
        fontWeight="800"
        fill="white"
        stroke="none"
        fontFamily="Arial, sans-serif"
      >
        FIPE
      </text>
    </svg>
  );
}

function PercentTagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-6 w-6 sm:h-7 sm:w-7"
    >
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8 8a2 2 0 0 0 2.828 0l7.172-7.172a2 2 0 0 0 0-2.828l-8-8Z" />
      <circle cx="8.5" cy="8.5" r="1" fill="white" stroke="none" />
      <circle cx="13.5" cy="13.5" r="1" fill="white" stroke="none" />
      <path d="M8 14.5 15.5 7" strokeWidth="1.5" />
    </svg>
  );
}

function StarFilledIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="white"
      aria-hidden="true"
      className="h-6 w-6 sm:h-7 sm:w-7"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />
    </svg>
  );
}

const ACTIONS = [
  { href: "/comprar", label: "Comprar", icon: <CarIcon /> },
  { href: "/anunciar", label: "Vender", icon: <TagIcon /> },
  { href: "/tabela-fipe", label: "FIPE", icon: <FileIcon /> },
  { href: "/comprar?below_fipe=true", label: "Ofertas", icon: <PercentTagIcon /> },
  { href: "/planos", label: "Planos", icon: <StarFilledIcon /> },
];

export function HomeShortcuts() {
  return (
    <nav
      aria-label="Atalhos rápidos"
      className="mx-auto w-full max-w-8xl px-4 pt-4 sm:px-6 sm:pt-7 lg:px-8"
    >
      <ul className="flex items-start gap-1 sm:gap-3">
        {ACTIONS.map(({ href, label, icon }) => (
          <li key={href} className="flex min-w-0 flex-1 justify-center">
            <Link
              href={href}
              aria-label={label}
              className="flex flex-col items-center gap-1.5 outline-none focus-visible:opacity-90 sm:gap-2"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 shadow-[0_4px_12px_rgba(37,99,235,0.30)] transition hover:bg-blue-700 active:scale-95 sm:h-16 sm:w-16">
                {icon}
              </div>
              <span className="text-[12px] font-semibold text-slate-900 sm:text-[13px]">
                {label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
