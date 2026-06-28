"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { useCityOptional } from "@/lib/city/CityContext";
import { DEFAULT_PUBLIC_CITY_SLUG, getPublicSocialLinks } from "@/lib/site/public-config";
import { SITE_LOGO_SRC } from "@/lib/site/brand-assets";
import {
  buildFooterNavSections,
  SITE_ROUTES,
  type SiteNavSection,
  type TerritorialContext,
} from "@/lib/site/site-navigation";

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

/**
 * Coluna do footer.
 *
 * Mobile (< sm): renderiza como `<details>` nativo (accordion sem JS) —
 *   evita o footer virar uma lista vertical gigante no celular. Header
 *   visível, links recolhidos por padrão.
 * Desktop (sm+):  renderiza com a lista sempre aberta. `<summary>` perde
 *   o triângulo via CSS (`list-none`) e vira só o título da coluna.
 *
 * Acessibilidade: `<details>` é interativo nativo, com role implícito de
 * "group" e estado de toggle anunciado pelo screen reader.
 */
function FooterColumn({
  section,
  headingClass,
  linkClass,
}: {
  section: SiteNavSection;
  headingClass: string;
  linkClass: string;
}) {
  return (
    <details
      open
      className="group border-b border-white/10 pb-4 sm:border-none sm:pb-0 [&[open]>summary>svg]:rotate-180"
      data-footer-col={section.id}
    >
      <summary
        className={`${headingClass} flex cursor-pointer list-none items-center justify-between py-2 sm:cursor-default sm:py-0 [&::-webkit-details-marker]:hidden`}
      >
        <span>{section.title}</span>
        {/* Chevron — visível só no mobile, apontando para direção do toggle */}
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="h-4 w-4 shrink-0 transition-transform sm:hidden"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 7.5 10 12.5l5-5" />
        </svg>
      </summary>
      <ul className="mt-3 space-y-2.5 text-sm sm:mt-4">
        {section.links.map((link) => (
          <li key={`${section.id}-${link.id}`}>
            <FooterAnchor item={link} className={linkClass} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function FooterNavGrid({
  headingClass,
  linkClass,
  sections,
}: {
  headingClass: string;
  linkClass: string;
  sections: SiteNavSection[];
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-3 xl:grid-cols-6">
      {sections.map((section) => (
        <FooterColumn
          key={section.id}
          section={section}
          headingClass={headingClass}
          linkClass={linkClass}
        />
      ))}
    </div>
  );
}

/**
 * Deriva contexto territorial a partir do pathname atual.
 *
 * Convenções de rota:
 *   /carros-em/{citySlug}             → city ativa
 *   /carros-usados/regiao/{citySlug}  → city ativa (slug da base)
 *   /carros-usados/{uf}               → UF ativa (sem city)
 *   /comprar/estado/{uf}              → UF ativa (legado)
 *
 * Quando não casa, retorna {} e o footer usa fallback nacional.
 *
 * Não toca em `CityContext` porque ele nem sempre está disponível em
 * rotas server-rendered (catálogo, blog, sobre). Pathname é universal.
 */
function deriveTerritorialContext(
  pathname: string | null,
  cityFromCtx: { slug?: string; state?: string } | null
): TerritorialContext {
  if (cityFromCtx?.slug) {
    return { citySlug: cityFromCtx.slug, stateUf: cityFromCtx.state };
  }

  const safe = pathname || "";

  const cidadeMatch = safe.match(/^\/carros-em\/([a-z0-9-]+)/i);
  if (cidadeMatch?.[1]) {
    const slug = cidadeMatch[1];
    const uf = slug.match(/-([a-z]{2})$/i)?.[1]?.toUpperCase();
    return { citySlug: slug, stateUf: uf };
  }

  const regionalMatch = safe.match(/^\/carros-usados\/regiao\/([a-z0-9-]+)/i);
  if (regionalMatch?.[1]) {
    const slug = regionalMatch[1];
    const uf = slug.match(/-([a-z]{2})$/i)?.[1]?.toUpperCase();
    return { citySlug: slug, stateUf: uf };
  }

  const estadualMatch = safe.match(/^\/carros-usados\/([a-z]{2})(?:[/?]|$)/i);
  if (estadualMatch?.[1]) {
    return { stateUf: estadualMatch[1].toUpperCase() };
  }

  const legacyEstadualMatch = safe.match(/^\/comprar\/estado\/([a-z]{2})(?:[/?]|$)/i);
  if (legacyEstadualMatch?.[1]) {
    return { stateUf: legacyEstadualMatch[1].toUpperCase() };
  }

  return {};
}

export function PublicFooter() {
  const currentYear = new Date().getFullYear();
  const socials = getPublicSocialLinks();
  const cityCtx = useCityOptional();
  const pathname = usePathname();

  const territorial = useMemo(
    () =>
      deriveTerritorialContext(
        pathname,
        cityCtx?.city ? { slug: cityCtx.city.slug, state: cityCtx.city.state } : null
      ),
    [pathname, cityCtx?.city]
  );

  const footerSections = useMemo(
    () => buildFooterNavSections(cityCtx?.city.slug ?? DEFAULT_PUBLIC_CITY_SLUG, territorial),
    [cityCtx?.city.slug, territorial]
  );

  return (
    <footer
      data-public-footer
      className="mt-auto border-t border-white/10 bg-[linear-gradient(165deg,#1a3a7a_0%,#0f2249_45%,#0a1833_100%)] text-white"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="grid gap-10 border-b border-white/12 pb-10 lg:grid-cols-[1fr_2fr] lg:gap-14 xl:grid-cols-[1fr_3fr]">
          <div>
            <Link href={SITE_ROUTES.home} className="inline-block" aria-label="Carros na Cidade">
              {/*
                Footer tem fundo navy escuro. O logo oficial é dark
                (texto/carro navy + acentos azuis) e some no escuro;
                aplicamos `brightness-0 invert` para virar uma silhueta
                branca legível, preservando o formato.
              */}
              <img
                src={SITE_LOGO_SRC}
                alt="Carros na Cidade"
                className="h-14 w-auto max-w-[240px] object-contain object-left brightness-0 invert"
                loading="lazy"
              />
            </Link>

            <p className="mt-5 max-w-md text-sm leading-relaxed text-white/80">
              Marketplace automotivo regional: catálogo por cidade, referência FIPE local e
              negociação com contexto — sem estoque genérico nacional.
            </p>

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

          <FooterNavGrid
            headingClass="text-[13px] font-extrabold uppercase tracking-[0.18em] text-white/95"
            linkClass="inline-flex min-h-8 items-center text-white/70 transition hover:text-white"
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
