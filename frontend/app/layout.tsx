import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

import { AppProviders } from "@/components/providers/AppProviders";
import { cityContextFromSlug } from "@/lib/buy/territory-variant";
import { extractCitySlugFromPathname } from "@/lib/city/city-from-pathname";
import { resolvePublicDefaultCity } from "@/lib/city/public-default-city";
import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import type { CityRef } from "@/lib/city/city-types";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";

import { SITE_FAVICON_SRC, SITE_OG_IMAGE_PATH } from "@/lib/site/brand-assets";
import { fetchFooterInventory } from "@/lib/site/footer-inventory";

import { PublicHeader } from "../components/shell/PublicHeader";
import { PublicFooter } from "../components/shell/PublicFooter";
import { AnalyticsTracker } from "@/components/analytics/AnalyticsTracker";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  fallback: ["system-ui", "Arial", "sans-serif"],
});

const SITE_NAME = "Carros na Cidade";
const DEFAULT_TITLE = "Carros na Cidade | Marketplace automotivo regional";
const TITLE_TEMPLATE = "%s | Carros na Cidade";
const DEFAULT_SITE_URL = "https://carrosnacidade.com";
const DEFAULT_DESCRIPTION =
  "Marketplace automotivo regional: carros por cidade e estado, listagens que respeitam o território, referência FIPE e negociação com contexto local — Carros na Cidade.";

const DEFAULT_KEYWORDS = [
  "carros na cidade",
  "carros usados",
  "carros seminovos",
  "portal de carros",
  "comprar carro",
  "carros abaixo da fipe",
  "carros por cidade",
  "anúncios de veículos",
  "veículos usados",
  "veículos seminovos",
  "portal automotivo",
  "marketplace automotivo",
] as const;

function parseUrl(value?: string | null): URL | null {
  if (!value) return null;

  try {
    return new URL(value.trim().replace(/\/+$/, ""));
  } catch {
    return null;
  }
}

function resolveSiteUrl(): URL {
  return parseUrl(process.env.NEXT_PUBLIC_SITE_URL) ?? new URL(DEFAULT_SITE_URL);
}

const siteUrl = resolveSiteUrl();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e62d8",
  colorScheme: "light",
};

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: SITE_NAME,
  title: {
    default: DEFAULT_TITLE,
    template: TITLE_TEMPLATE,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [...DEFAULT_KEYWORDS],
  category: "automotive",
  alternates: {
    canonical: "/",
  },
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: siteUrl.toString(),
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: SITE_OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [SITE_OG_IMAGE_PATH],
  },
  icons: {
    icon: [{ url: SITE_FAVICON_SRC, type: "image/png" }],
    shortcut: [SITE_FAVICON_SRC],
    apple: [{ url: SITE_FAVICON_SRC }],
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "default",
  },
  other: {
    "apple-mobile-web-app-title": SITE_NAME,
    "mobile-web-app-capable": "yes",
  },
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

/**
 * Resolve a cidade ativa para o SSR — auditoria 2026-05-11.
 *
 * Hierarquia:
 *   1. Slug derivado do pathname em rotas territoriais (ex.:
 *      `/carros-em/atibaia-sp` → atibaia-sp). O `pathname` chega via
 *      header interno `x-cnc-pathname` injetado pelo middleware.
 *      Quando presente, é a fonte mais confiável (URL do usuário).
 *   2. Cookie `cnc_city` salvo em visitas anteriores.
 *   3. Cidade pública PRIMÁRIA, resolvida do estoque real.
 *   4. `null` — o portal não tem cidade nenhuma.
 *
 * Sem este resolver, todas as páginas territoriais de outras cidades
 * (`/carros-em/atibaia-sp`, `/carros-usados/regiao/atibaia-sp`, etc.)
 * recebiam SSR com a cidade padrão → header com links errados (links
 * para `sao-paulo-sp` em página de Atibaia). O fix do `CityContext`
 * client-side cobria o caso pós-hidratação mas deixava flash inicial
 * e crawlers sem JS verem incoerência.
 *
 * ── Por que os passos 3 e 4 mudaram (SEO Fase 4.1A, achado P1-2) ────────
 * A última linha era `DEFAULT_CITY`, o literal `sao-paulo-sp` — cidade com
 * ZERO anúncios ativos, que o gate territorial responde 404. Como o
 * Googlebot nunca manda cookie, o crawler caía SEMPRE nessa linha e recebia
 * o chrome do site inteiro apontando para seis URLs mortas.
 *
 * Agora o piso é o estoque real, e a ausência de estoque é representada por
 * `null` — não por uma cidade inventada. `getTerritorialRoutesForCity(null)`
 * já degrada para as rotas-índice, que existem e respondem 200.
 */
async function resolveSsrInitialCity(
  pathname: string | null,
  cookieValue: string | undefined
): Promise<CityRef | null> {
  if (pathname) {
    const slug = extractCitySlugFromPathname(pathname);
    if (slug) {
      const ctx = cityContextFromSlug(slug);
      return {
        slug: ctx.slug,
        name: ctx.name,
        state: ctx.state,
        label: ctx.label,
      };
    }
  }

  const fromCookie = parseCityCookieValue(cookieValue);
  if (fromCookie) return fromCookie;

  // Backend fora devolve `null` aqui também: sem saber qual cidade existe, o
  // chrome sai sem links territoriais em vez de sair com links quebrados.
  return resolvePublicDefaultCity();
}

export default async function RootLayout({ children }: RootLayoutProps) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const rawCity = cookieStore.get(CITY_COOKIE_NAME)?.value;
  const pathname = headerStore.get("x-cnc-pathname");
  // Inventário do rodapé resolvido no servidor: o footer é client component e
  // não pode buscar sozinho sem virar fetch no browser em toda página. Cache de
  // 1h no fetch; falha devolve inventário vazio (as colunas somem) e loga.
  //
  // Em paralelo com a cidade inicial: as duas leituras são independentes e
  // ambas já são cacheadas: encadeá-las custaria um round-trip por navegação.
  const [initialCity, footerInventory] = await Promise.all([
    resolveSsrInitialCity(pathname, rawCity),
    fetchFooterInventory(),
  ]);

  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-screen bg-[var(--cnc-bg)] font-sans text-[var(--cnc-text)] antialiased">
        <AppProviders initialCity={initialCity}>
          <AnalyticsTracker />
          <div className="flex min-h-screen flex-col">
            <Suspense
              fallback={
                <div className="h-[72px] border-b border-[#E6EAF2] bg-white/95" aria-hidden />
              }
            >
              <PublicHeader />
            </Suspense>
            {/*
              `min-h-[calc(100vh-3.5rem)]`: reserva exatamente a área de
              conteúdo abaixo do header (sticky, ~3.5rem/57px).

              Páginas públicas que adiam o conteúdo para um boundary de
              Suspense (ex.: /tabela-fipe — o conteúdo do `<main>` no flush
              inicial é só `<template id="P:1">`, vazio) faziam o `<footer>`,
              que é renderizado fora de qualquer Suspense, aparecer durante a
              janela de streaming, ANTES do conteúdo chegar ao `<main>`. Como
              o `<main>` era só `flex-1`, ele colapsava enquanto vazio e o
              footer subia para a viewport.

              Reservando ~(100vh - header), o `<main>` vazio ocupa toda a área
              visível e empurra o footer para a dobra (fora da tela) até o
              conteúdo (ou skeleton da própria página) chegar. NÃO altera a
              ordem do HTML (header → main → footer) nem o SEO — é só reserva
              de espaço vertical. Mantém `flex-1`, então em páginas curtas o
              footer continua colado ao rodapé (mesmo comportamento de antes).
            */}
            <main id="main-content" className="flex-1 min-h-[calc(100vh-3.5rem)]">
              {children}
            </main>
            <PublicFooter inventory={footerInventory} />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
