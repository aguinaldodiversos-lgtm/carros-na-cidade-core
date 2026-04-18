"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useCityOptional } from "@/lib/city/CityContext";
import { DEFAULT_PUBLIC_CITY_SLUG, getPublicSocialLinks } from "@/lib/site/public-config";
import { SITE_LOGO_SRC } from "@/lib/site/brand-assets";
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

function FooterNavColumns({
  headingClass,
  sections,
}: {
  headingClass: string;
  sections: ReturnType<typeof buildFooterNavSections>;
}) {
  return (
    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {sections.map((group) => (
        <div key={group.id}>
          <h3 className={headingClass}>{group.title}</h3>
          <ul className="mt-4 space-y-2.5 text-sm">
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
  const currentYear = new Date().getFullYear();
  const socials = getPublicSocialLinks();
  const cityCtx = useCityOptional();
  const footerSections = useMemo(
    () => buildFooterNavSections(cityCtx?.city.slug ?? DEFAULT_PUBLIC_CITY_SLUG),
    [cityCtx?.city.slug]
  );

  return (
    <footer className="mt-auto border-t border-white/10 bg-[linear-gradient(165deg,#1a3a7a_0%,#0f2249_45%,#0a1833_100%)] text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <div className="grid gap-12 border-b border-white/12 pb-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          <div>
            <Link href={SITE_ROUTES.home} className="inline-block" aria-label="Carros na Cidade">
              <img
                src={SITE_LOGO_SRC}
                alt="Carros na Cidade"
                className="h-12 w-auto max-w-[240px] object-contain object-left"
                loading="lazy"
              />
            </Link>

            <p className="mt-5 max-w-md text-sm leading-relaxed text-white/80">
              Marketplace automotivo regional: catálogo por cidade, referência FIPE local e
              negociação com contexto — sem estoque genérico nacional.
            </p>

            <div className="mt-6 space-y-2 text-sm">
              <a
                href={`mailto:${SITE_CONTACT.email}`}
                className="flex w-fit items-center gap-2 rounded-lg border border-white/20 px-3 py-2 font-medium text-white/90 transition hover:border-white/40 hover:bg-white/5"
              >
                <span className="text-white/55">E-mail</span>
                {SITE_CONTACT.email}
              </a>

              <a
                href={SITE_CONTACT.phoneHref}
                className="flex w-fit items-center gap-2 rounded-lg border border-white/20 px-3 py-2 font-medium text-white/90 transition hover:border-white/40 hover:bg-white/5"
              >
                <span className="text-white/55">Telefone</span>
                {SITE_CONTACT.phoneDisplay}
              </a>
            </div>

            {socials.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {socials.map((social) => (
                  <FooterAnchor
                    key={social.href}
                    item={{ ...social, external: true }}
                    className="inline-flex h-10 items-center rounded-full border border-white/20 px-4 text-sm font-semibold text-white/90 transition hover:border-white/45 hover:bg-white/10"
                  />
                ))}
              </div>
            ) : null}
          </div>

          <FooterNavColumns
            headingClass="text-[13px] font-extrabold uppercase tracking-[0.18em] text-white/95"
            sections={footerSections}
          />
        </div>

        <div className="flex flex-col gap-4 pt-8 text-sm text-white/55 md:flex-row md:items-center md:justify-between">
          <p className="font-medium">
            © {currentYear} Carros na Cidade. Todos os direitos reservados.
          </p>

          <FooterLegalLinks className="flex flex-wrap gap-x-6 gap-y-2" />
        </div>
      </div>
    </footer>
  );
}

export default PublicFooter;
