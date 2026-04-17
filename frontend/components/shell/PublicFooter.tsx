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

export function PublicFooter() {
  const currentYear = new Date().getFullYear();
  const socials = getPublicSocialLinks();
  const cityCtx = useCityOptional();
  const sections = useMemo(
    () => buildFooterNavSections(cityCtx?.city.slug ?? DEFAULT_PUBLIC_CITY_SLUG),
    [cityCtx?.city.slug]
  );

  const orderedSections = useMemo(() => {
    const order = ["institucional", "comprar", "vender", "conteudo"];
    return order
      .map((id) => sections.find((s) => s.id === id))
      .filter(Boolean) as typeof sections;
  }, [sections]);

  const headingClass =
    "text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#1a1f36]";
  const linkClass =
    "inline-flex min-h-8 items-center text-[13.5px] text-[#5b6079] transition hover:text-[#2d3a9c]";

  return (
    <footer className="mt-auto border-t border-[#e7e8f1] bg-white text-[#1a1f36]">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_repeat(5,minmax(0,1fr))] lg:gap-8">
          <div className="lg:col-span-1">
            <Link href={SITE_ROUTES.home} className="inline-block" aria-label="Carros na Cidade">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={SITE_LOGO_SRC}
                alt="Carros na Cidade"
                className="h-11 w-auto max-w-[220px] object-contain object-left"
                loading="lazy"
              />
            </Link>
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-[#5b6079]">
              © {currentYear} Carros na Cidade. Todos os direitos reservados. Marketplace automotivo
              regional por cidade.
            </p>
            {socials.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {socials.map((social) => (
                  <FooterAnchor
                    key={social.href}
                    item={{ ...social, external: true }}
                    className="inline-flex h-9 items-center rounded-full border border-[#dbe0ee] bg-[#f5f7fb] px-3 text-[12px] font-semibold text-[#2d3a9c] transition hover:border-[#a5b0dd] hover:bg-[#e8ebf5]"
                  />
                ))}
              </div>
            ) : null}
          </div>

          {orderedSections.map((group) => (
            <div key={group.id}>
              <h3 className={headingClass}>{group.title}</h3>
              <ul className="mt-4 space-y-2">
                {group.links.map((link) => (
                  <li key={`${group.id}-${link.id}`}>
                    <FooterAnchor item={link} className={linkClass} />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h3 className={headingClass}>Fale conosco</h3>
            <ul className="mt-4 space-y-2">
              <li>
                <a href={`mailto:${SITE_CONTACT.email}`} className={linkClass}>
                  {SITE_CONTACT.email}
                </a>
              </li>
              <li>
                <a href={SITE_CONTACT.phoneHref} className={linkClass}>
                  {SITE_CONTACT.phoneDisplay}
                </a>
              </li>
              <li>
                <Link href={SITE_ROUTES.contato} className={linkClass}>
                  Formulário de contato
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-[#e7e8f1] pt-6 text-[12.5px] text-[#858aa0] md:flex-row md:items-center md:justify-between">
          <p>
            Carros na Cidade — Marketplace automotivo regional. Catálogo por cidade, referência FIPE
            local.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href={SITE_ROUTES.privacy} className="transition hover:text-[#2d3a9c]">
              Política de privacidade
            </Link>
            <Link href={SITE_ROUTES.terms} className="transition hover:text-[#2d3a9c]">
              Termos de uso
            </Link>
            <Link href={SITE_ROUTES.lgpd} className="transition hover:text-[#2d3a9c]">
              LGPD
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default PublicFooter;
