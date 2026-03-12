"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

type FooterGroup = {
  title: string;
  links: Array<{ label: string; href: string }>;
};

const groups: FooterGroup[] = [
  {
    title: "Comprar",
    links: [
      { label: "Ver anúncios", href: "/anuncios" },
      { label: "Comprar", href: "/comprar" },
      { label: "Oportunidades", href: "/anuncios" },
      { label: "Abaixo da FIPE", href: "/anuncios?below_fipe=true" },
      { label: "Simulador de financiamento", href: "/simulador-financiamento" },
    ],
  },
  {
    title: "Vender",
    links: [
      { label: "Anunciar no portal", href: "/planos" },
      { label: "Planos para lojistas", href: "/planos" },
      { label: "Impulsionar anúncio", href: "/login?next=/dashboard-loja" },
      { label: "Área do lojista", href: "/login?next=/dashboard-loja" },
    ],
  },
  {
    title: "Conteúdo",
    links: [
      { label: "Tabela FIPE", href: "/tabela-fipe" },
      { label: "Blog automotivo", href: "/blog" },
      { label: "Cidades em foco", href: "/anuncios" },
      { label: "Notícias", href: "/blog" },
    ],
  },
  {
    title: "Institucional",
    links: [
      { label: "Sobre", href: "/sobre" },
      { label: "Contato", href: "/contato" },
      { label: "Entrar", href: "/login" },
      { label: "Planos", href: "/planos" },
    ],
  },
];

const socials = [
  { label: "Instagram", href: "https://instagram.com" },
  { label: "Facebook", href: "https://facebook.com" },
  { label: "LinkedIn", href: "https://linkedin.com" },
];

export function PublicFooter() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  if (isHome) {
    return (
      <footer className="mt-4 bg-[#18253f] text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 text-[12px] text-white/75 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="relative block h-4 w-[90px]" aria-label="Carros na Cidade">
              <Image
                src="/images/logo.png"
                alt="Carros na Cidade"
                fill
                sizes="90px"
                className="object-contain object-left brightness-0 invert"
              />
            </Link>
            <span>© 2026 Carros na Cidade. Todos os direitos reservados.</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link href="https://facebook.com" target="_blank" rel="noreferrer" className="transition hover:text-white">
              Facebook
            </Link>
            <Link href="https://instagram.com" target="_blank" rel="noreferrer" className="transition hover:text-white">
              Instagram
            </Link>
            <Link href="/contato" className="transition hover:text-white">
              (11) 98768-4221
            </Link>
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
            <Link
              href="/"
              className="relative block h-11 w-[195px]"
              aria-label="Carros na Cidade"
            >
              <Image
                src="/images/logo.png"
                alt="Carros na Cidade"
                fill
                sizes="195px"
                className="object-contain object-left brightness-0 invert"
              />
            </Link>

            <p className="mt-4 max-w-xl text-sm leading-7 text-white/75">
              Portal automotivo regional com foco em performance, autoridade local,
              busca inteligente e estrutura preparada para crescer cidade por cidade.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/75">
              <span className="inline-flex items-center rounded-full border border-white/15 px-3 py-1">
                contato@carrosnacidade.com
              </span>
              <span className="inline-flex items-center rounded-full border border-white/15 px-3 py-1">
                (11) 98768-4221
              </span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {socials.map((social) => (
                <Link
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center rounded-full border border-white/15 px-4 text-sm font-medium text-white/85 transition hover:border-white/35 hover:text-white"
                >
                  {social.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {groups.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-white/90">
                  {group.title}
                </h3>

                <ul className="mt-4 space-y-2.5 text-sm text-white/70">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="inline-flex min-h-10 items-center transition hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-6 text-sm text-white/60 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Carros na Cidade. Todos os direitos reservados.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/politica-de-privacidade" className="transition hover:text-white">
              Política de privacidade
            </Link>
            <Link href="/termos-de-uso" className="transition hover:text-white">
              Termos de uso
            </Link>
            <Link href="/lgpd" className="transition hover:text-white">
              LGPD
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
