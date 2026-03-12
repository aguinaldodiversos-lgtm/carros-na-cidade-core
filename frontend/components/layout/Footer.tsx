import Image from "next/image";
import Link from "next/link";

type FooterGroup = {
  title: string;
  links: Array<{ label: string; href: string }>;
};

const groups: FooterGroup[] = [
  {
    title: "Institucional",
    links: [
      { label: "Sobre nos", href: "/sobre" },
      { label: "Trabalhe conosco", href: "/trabalhe-conosco" },
      { label: "Contato", href: "/contato" },
    ],
  },
  {
    title: "Comprar",
    links: [
      { label: "Buscar veiculos", href: "/anuncios" },
      { label: "Veiculos abaixo da FIPE", href: "/anuncios?below_fipe=true" },
      { label: "Simulador", href: "/simulador-financiamento" },
    ],
  },
  {
    title: "Vender",
    links: [
      { label: "Criar anuncio", href: "/anunciar" },
      { label: "Planos", href: "/planos" },
      { label: "Tabela FIPE", href: "/tabela-fipe" },
    ],
  },
  {
    title: "Conteudo",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Noticias", href: "/blog" },
      { label: "Dicas", href: "/blog" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Politica de privacidade", href: "/politica-de-privacidade" },
      { label: "Termos de uso", href: "/termos-de-uso" },
      { label: "LGPD", href: "/lgpd" },
    ],
  },
];

const socials = [
  {
    label: "Instagram",
    href: "https://instagram.com",
    path: "M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3Zm4.5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.1-.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z",
  },
  {
    label: "Facebook",
    href: "https://facebook.com",
    path: "M13 8h3V4h-3c-2.2 0-4 1.8-4 4v2H6v4h3v6h4v-6h3.2l.8-4H13V8Z",
  },
  {
    label: "LinkedIn",
    href: "https://linkedin.com",
    path: "M7 9v8M7 6.5v.01M11 17V9h4a3 3 0 0 1 3 3v5M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
  },
];

function SocialIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d={path} />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="mt-12 bg-[linear-gradient(135deg,#16326a_0%,#0d1a38_100%)] text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-col gap-4 border-b border-white/15 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/" className="relative block h-10 w-[190px]">
              <Image src="/images/logo.png" alt="Carros na Cidade" fill className="object-contain object-left brightness-0 invert" />
            </Link>
            <p className="mt-3 text-sm text-white/75">
              Marketplace premium para comprar e vender carros com inteligencia local.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {socials.map((social) => (
              <Link
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                aria-label={social.label}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white/90 transition hover:border-white/40 hover:text-white"
              >
                <SocialIcon path={social.path} />
              </Link>
            ))}
          </div>
        </div>

        <div className="md:hidden">
          <div className="space-y-2">
            {groups.map((group) => (
              <details key={group.title} className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                <summary className="cursor-pointer list-none py-1 text-[15px] font-extrabold">
                  {group.title}
                </summary>
                <ul className="mt-2 space-y-2 pb-1 text-sm text-white/75">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="inline-flex min-h-11 items-center transition hover:text-white">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>

        <div className="hidden gap-8 sm:grid-cols-2 md:grid lg:grid-cols-5">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-base font-extrabold">{group.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-white/75">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="inline-flex min-h-11 items-center transition hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 border-t border-white/15 pt-6 text-sm text-white/65">
          <p>© {new Date().getFullYear()} Carros na Cidade. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
