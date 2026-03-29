/**
 * Faixa discreta de confiança — mensagens próprias do portal (sem estética de marketplace genérico).
 */
export function TrustRibbon() {
  const items = [
    {
      id: "regional",
      text: "A cidade vem antes do catálogo: território guia busca, preço e o que faz sentido na sua rota.",
      icon: <IconMap className="shrink-0" />,
    },
    {
      id: "privacidade",
      text: "Privacidade e dados pessoais tratados com responsabilidade, em linha com a LGPD.",
      icon: <IconShield className="shrink-0" />,
    },
    {
      id: "transparencia",
      text: "Regras de uso e planos claros — você sabe o que esperar ao anunciar ou negociar.",
      icon: <IconDoc className="shrink-0" />,
    },
  ];

  return (
    <div
      className="border-b border-[#E8EEF8] bg-[linear-gradient(180deg,#FAFCFF_0%,#F4F8FF_100%)]"
      role="region"
      aria-label="Compromissos do Carros na Cidade"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 sm:py-3.5">
        <ul className="grid gap-3 sm:grid-cols-3 sm:gap-5 md:gap-8">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 text-[12px] leading-relaxed text-[#4A556D] sm:min-h-[2.75rem] sm:items-center sm:text-[13px]"
            >
              <span className="mt-0.5 shrink-0 text-[#2F67F6] sm:mt-0" aria-hidden>
                {item.icon}
              </span>
              <span className="text-balance">{item.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function IconMap({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      width={19}
      height={19}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s7-4.5 7-10a7 7 0 1 0-14 0c0 5.5 7 10 7 10Z" />
      <circle cx="12" cy="11" r="2.5" />
    </svg>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      width={19}
      height={19}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s8-4.5 8-10V6l-8-3-8 3v5c0 5.5 8 10 8 10Z" />
      <path d="m9.5 11.5 1.7 1.7 3.8-3.8" />
    </svg>
  );
}

function IconDoc({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      width={19}
      height={19}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  );
}
