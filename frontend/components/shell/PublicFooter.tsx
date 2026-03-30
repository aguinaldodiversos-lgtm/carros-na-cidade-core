"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { useCityOptional } from "@/lib/city/CityContext";
import { DEFAULT_PUBLIC_CITY_SLUG, getPublicSocialLinks } from "@/lib/site/public-config";
import { buildFooterNavSections, SITE_CONTACT, SITE_ROUTES } from "@/lib/site/site-navigation";

type FooterLinkItem = {
  label: string;
  href: string;
  external?: boolean;
};

function isExternalHref(href: string) {
  return (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  );
}

function FooterAnchor({ item, className }: { item: FooterLinkItem; className?: string }) {
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

function FooterLegalLinks({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Link href={SITE_ROUTES.privacy} className="transition hover:text-white">
        Política de privacidade
      </Link>
      <Link href={SITE_ROUTES.terms} className="transition hover:text-white">
        Termos de uso
      </Link>
      <Link href={SITE_ROUTES.lgpd} className="transition hover:text-white">
        LGPD
      </Link>
    </div>
  );
}

/** Mesmos quatro pilares do rodapé completo, em versão compacta (home). */
function FooterNavColumns({
  dense,
  headingClass,
  sections,
}: {
  dense?: boolean;
  headingClass: string;
  sections: ReturnType<typeof buildFooterNavSections>;
}) {
  return (
    <div
      className={
        dense
          ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          : "grid gap-8 sm:grid-cols-2 lg:grid-cols-4"
      }
    >
      {sections.map((group) => (
        <div key={group.id}>
          <h3 className={headingClass}>{group.title}</h3>
          <ul className={dense ? "mt-2 space-y-1.5 text-[12px]" : "mt-4 space-y-2.5 text-sm"}>
            {group.links.map((link) => (
              <li key={`${group.id}-${link.id}`}>
                <FooterAnchor
                  item={link}
                  className="inline-flex min-h-9 items-center text-white/70 transition hover:text-white"
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function PublicFooter() {
  const pathname = usePathname() || "/";
  const isHome = pathname === "/";
  const currentYear = new Date().getFullYear();
  const socials = getPublicSocialLinks();
  const cityCtx = useCityOptional();
  const footerSections = useMemo(
    () => buildFooterNavSections(cityCtx?.city.slug ?? DEFAULT_PUBLIC_CITY_SLUG),
    [cityCtx?.city.slug]
  );

  if (isHome) {
    return (
      <footer className="mt-auto bg-[#141a2e] text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="flex max-w-xl flex-col gap-3">
              <Link href={SITE_ROUTES.home} className="inline-block" aria-label="Carros na Cidade">
                <img
                  src="/images/logo.png"
                  alt="Carros na Cidade"
                  className="h-6 w-[120px] object-contain brightness-0 invert sm:h-7 sm:w-[140px]"
                  loading="lazy"
                />
              </Link>
              <p className="text-[13px] leading-relaxed text-white/65">
                © {currentYear} Carros na Cidade. Todos os direitos reservados.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-5 md:justify-end">
              {socials.length > 0 ? (
                <div className="flex items-center gap-4" aria-label="Redes sociais">
                  {socials.map((s) => (
                    <FooterAnchor
                      key={s.href}
                      item={{ ...s, external: true }}
                      className="text-white/80 transition hover:text-white"
                    />
                  ))}
                </div>
              ) : null}
              <a
                href={SITE_CONTACT.phoneHref}
                className="inline-flex items-center gap-2 text-[14px] font-semibold text-white/90 hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M6.6 10.8c1.8 3.6 4.8 6.6 8.4 8.4l2.8-2.8c.4-.4 1-.5 1.5-.3 1 .4 2.1.6 3.3.6.8 0 1.4.6 1.4 1.4V21c0 .8-.6 1.4-1.4 1.4C9.4 22.4 1.6 14.6 1.6 4.9 1.6 4.1 2.2 3.5 3 3.5h2.1c.8 0 1.4.6 1.4 1.4 0 1.1.2 2.3.6 3.3.2.5.1 1.1-.3 1.5l-2.8 2.8Z" />
                </svg>
                {SITE_CONTACT.phoneDisplay}
              </a>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 border-t border-white/10 pt-4 text-[12px] text-white/55">
            <FooterLegalLinks className="flex flex-wrap gap-4" />
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
            <Link href={SITE_ROUTES.home} className="block" aria-label="Carros na Cidade">
              <img
                src="/images/logo.png"
                alt="Carros na Cidade"
                className="h-11 w-[195px] object-contain object-left brightness-0 invert"
                loading="lazy"
              />
            </Link>

            <p className="mt-4 max-w-xl text-sm leading-7 text-white/75">
              Marketplace onde a cidade manda: anúncios com território claro, listagens que
              respeitam a sua região e ferramentas para comprar ou vender com contexto local — sem
              promessa de &quot;estoque nacional&quot; genérico.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/75">
              <a
                href={`mailto:${SITE_CONTACT.email}`}
                className="inline-flex items-center rounded-full border border-white/15 px-3 py-1 transition hover:border-white/35 hover:text-white"
              >
                {SITE_CONTACT.email}
              </a>

              <a
                href={SITE_CONTACT.phoneHref}
                className="inline-flex items-center rounded-full border border-white/15 px-3 py-1 transition hover:border-white/35 hover:text-white"
              >
                {SITE_CONTACT.phoneDisplay}
              </a>
            </div>

            {socials.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {socials.map((social) => (
                  <FooterAnchor
                    key={social.href}
                    item={{ ...social, external: true }}
                    className="inline-flex h-10 items-center rounded-full border border-white/15 px-4 text-sm font-medium text-white/85 transition hover:border-white/35 hover:text-white"
                  />
                ))}
              </div>
            ) : null}
          </div>

          <FooterNavColumns
            headingClass="text-sm font-extrabold uppercase tracking-[0.16em] text-white/90"
            sections={footerSections}
          />
        </div>

        <div className="flex flex-col gap-3 pt-6 text-sm text-white/60 md:flex-row md:items-center md:justify-between">
          <p>© {currentYear} Carros na Cidade. Todos os direitos reservados.</p>

          <FooterLegalLinks className="flex flex-wrap gap-4" />
        </div>
      </div>
    </footer>
  );
}

export default PublicFooter;
