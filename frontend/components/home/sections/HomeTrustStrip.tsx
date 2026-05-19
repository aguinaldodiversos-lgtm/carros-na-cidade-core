// frontend/components/home/sections/HomeTrustStrip.tsx

/**
 * Faixa discreta de confiança da Home — contrato visual
 * `atualização-home.png` (revisão 2026-05-19).
 *
 * 3 itens lado a lado abaixo dos cards rápidos (HomePrimaryActions):
 *   • Anúncios locais     — "Mais relevantes para você"
 *   • Contato direto      — "Fale com quem anuncia"
 *   • Mais confiança      — "Plataforma segura e transparente"
 *
 * Regras do brief:
 *   - Visual discreto, não pode virar banner.
 *   - Ícones em cinza/azul escuro (slate-700).
 *   - Não consumir altura excessiva.
 *
 * Server Component — sem hooks.
 */

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M21 12a8 8 0 0 1-12.5 6.6L3 20l1.4-5.5A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}

const ITEMS = [
  {
    title: "Anúncios locais",
    subtitle: "Mais relevantes para você",
    icon: <PinIcon />,
  },
  {
    title: "Contato direto",
    subtitle: "Fale com quem anuncia",
    icon: <ChatIcon />,
  },
  {
    title: "Mais confiança",
    subtitle: "Plataforma segura e transparente",
    icon: <ShieldIcon />,
  },
];

export function HomeTrustStrip() {
  return (
    <section
      aria-label="Por que escolher Carros na Cidade"
      className="mx-auto w-full max-w-8xl px-4 pt-5 sm:px-6 sm:pt-6 lg:px-8"
    >
      <ul className="grid grid-cols-3 gap-2 sm:gap-4">
        {ITEMS.map(({ title, subtitle, icon }) => (
          <li
            key={title}
            className="flex flex-col items-start gap-1.5 rounded-xl px-1 sm:px-0"
          >
            <span aria-hidden="true" className="text-slate-700">
              {icon}
            </span>
            <span className="text-[12px] font-semibold leading-tight text-slate-900 sm:text-[13px]">
              {title}
            </span>
            <span className="text-[10.5px] leading-tight text-slate-500 sm:text-[12px]">
              {subtitle}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
