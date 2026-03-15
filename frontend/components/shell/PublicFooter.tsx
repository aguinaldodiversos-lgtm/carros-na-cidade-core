"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type FooterLinkItem = {
  label: string;
  href: string;
  external?: boolean;
};

type FooterGroup = {
  title: string;
  links: FooterLinkItem[];
};

const DEFAULT_CITY_SLUG = "sao-paulo-sp";

const ROUTES = {
  home: "/",
  buy: "/comprar",
  buyBelowFipe: "/comprar?below_fipe=true",
  plans: "/planos",
  login: "/login",
  dealerArea: "/login?next=/dashboard-loja",
  blog: "/blog",
  fipe: `/tabela-fipe/${DEFAULT_CITY_SLUG}`,
  financing: `/simulador-financiamento/${DEFAULT_CITY_SLUG}`,
  privacy: "/politica-de-privacidade",
  terms: "/termos-de-uso",
  lgpd: "/lgpd",
} as const;

const CONTACT = {
  email: "contato@carrosnacidade.com",
  phoneDisplay: "(11) 98768-4221",
  phoneHref: "tel:+5511987684221",
} as const;

const SOCIALS: FooterLinkItem[] = [
  { label: "Instagram", href: "https://instagram.com", external: true },
  { label: "Facebook", href: "https://facebook.com", external: true },
  { label: "LinkedIn", href: "https://linkedin.com", external: true },
];

const GROUPS: FooterGroup[] = [
  {
    title: "Comprar",
    links: [
      { label: "Ver anúncios", href: ROUTES.buy },
      { label: "Comprar", href: ROUTES.buy },
      { label: "Oportunidades", href: ROUTES.buyBelowFipe },
      { label: "Abaixo da FIPE", href: ROUTES.buyBelowFipe },
      { label: "Simulador de financiamento", href: ROUTES.financing },
    ],
  },
  {
    title: "Vender",
    links: [
      { label: "Anunciar no portal", href: ROUTES.plans },
      { label: "Planos para lojistas", href: ROUTES.plans },
      { label: "Impulsionar anúncio", href: ROUTES.dealerArea },
      { label: "Área do lojista", href: ROUTES.dealerArea },
    ],
  },
  {
    title: "Conteúdo",
    links: [
      { label: "Tabela FIPE", href: ROUTES.fipe },
      { label: "Blog automotivo", href: ROUTES.blog },
      { label: "Cidades em foco", href: ROUTES.buy },
      { label: "Financiamento", href: ROUTES.financing },
    ],
  },
  {
    title: "Institucional",
    links: [
      { label: "Entrar", href: ROUTES.login },
      { label: "Planos", href: ROUTES.plans },
      { label: "Política de privacidade", href: ROUTES.privacy },
      { label: "Termos de uso", href: ROUTES.terms },
    ],
  },
];

function isExternalHref(href: string) {
  return (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  );
}

function FooterAnchor({
  item,
  className,
}: {
  item: FooterLinkItem;
  className?: string;
}) {
  const external = item.external || isExternalHref(item.href);

  if (external) {
    return (
      <a
        href={item.href}
        target={item.href.startsWith("http") ? "_blank" : undefined}
        rel={item.href.startsWith("http") ? "noreferrer" : undefined}
        className={className}
      >
        {item.label}
      </a>
    );
  }

  return (
    <Link href={item.href} className={className}>
      {item.label}
    </Link>
  );
}

export function PublicFooter() {
  const pathname = usePathname() || "/";
  const isHome = pathname === "/";
  const currentYear = new Date().getFullYear();

  if (isHome) {
    return (
      <footer className="mt-4 bg-[#18253f] text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 text-[12px] text-white/75 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={ROUTES.home} className="block" aria-label="Carros na Cidade">
              <img
                src="/images/logo.png"
                alt="Carros na Cidade"
                className="h-4 w-[90px] object-contain brightness-0 invert"
                loading="lazy"
              />
            </Link>

            <span>© {currentYear} Carros na Cidade. Todos os direitos reservados.</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <FooterAnchor
              item={{ label: "Facebook", href: "https://facebook.com", external: true }}
              className="transition hover:text-white"
            />
            <FooterAnchor
              item={{ label: "Instagram", href: "https://instagram.com", external: true }}
              className="transition hover:text-white"
            />
            <FooterAnchor
              item={{ label: CONTACT.phoneDisplay, href: CONTACT.phoneHref }}
              className="transition hover:text-white"
            />
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="mt-16 bg-[linear-gradient(135deg,#16326a_0%,#0d1a38_100%)] text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="grid gap-10 border-b border-white/15 pb-10 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <Link href={ROUTES.home} className="block" aria-label="Carros na Cidade">
              <img
                src="/images/logo.png"
                alt="Carros na Cidade"
                className="h-11 w-[195px] object-contain object-left brightness-0 invert"
                loading="lazy"
              />
            </Link>

            <p className="mt-4 max-w-xl text-sm leading-7 text-white/75">
              Portal automotivo regional com foco em performance, autoridade local,
              busca inteligente e estrutura preparada para crescer cidade por cidade.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/75">
              <a
                href={`mailto:${CONTACT.email}`}
                className="inline-flex items-center rounded-full border border-white/15 px-3 py-1 transition hover:border-white/35 hover:text-white"
              >
                {CONTACT.email}
              </a>

              <a
                href={CONTACT.phoneHref}
                className="inline-flex items-center rounded-full border border-white/15 px-3 py-1 transition hover:border-white/35 hover:text-white"
              >
                {CONTACT.phoneDisplay}
              </a>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {SOCIALS.map((social) => (
                <FooterAnchor
                  key={social.label}
                  item={social}
                  className="inline-flex h-10 items-center rounded-full border border-white/15 px-4 text-sm font-medium text-white/85 transition hover:border-white/35 hover:text-white"
                />
              ))}
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-white/90">
                  {group.title}
                </h3>

                <ul className="mt-4 space-y-2.5 text-sm text-white/70">
                  {group.links.map((link) => (
                    <li key={`${group.title}-${link.label}`}>
                      <FooterAnchor
                        item={link}
                        className="inline-flex min-h-10 items-center transition hover:text-white"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-6 text-sm text-white/60 md:flex-row md:items-center md:justify-between">
          <p>© {currentYear} Carros na Cidade. Todos os direitos reservados.</p>

          <div className="flex flex-wrap gap-4">
            <Link href={ROUTES.privacy} className="transition hover:text-white">
              Política de privacidade
            </Link>
            <Link href={ROUTES.terms} className="transition hover:text-white">
              Termos de uso
            </Link>
            <Link href={ROUTES.lgpd} className="transition hover:text-white">
              LGPD
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default PublicFooter;
