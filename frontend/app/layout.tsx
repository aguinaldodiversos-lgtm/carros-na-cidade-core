import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

import { AppProviders } from "@/components/providers/AppProviders";
import { DEFAULT_CITY } from "@/lib/city/city-default";
import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";

import { LayoutChrome } from "../components/shell/LayoutChrome";
import { PublicHeader } from "../components/shell/PublicHeader";
import { PublicFooter } from "../components/shell/PublicFooter";

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
const DEFAULT_OG_IMAGE = "/images/hero.jpeg";

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
        url: DEFAULT_OG_IMAGE,
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
    images: [DEFAULT_OG_IMAGE],
  },
  icons: {
    icon: [{ url: "/images/favicon.ico" }, { url: "/favicon.ico" }],
    shortcut: ["/images/favicon.ico", "/favicon.ico"],
    apple: [{ url: "/images/favicon.png" }],
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

export default async function RootLayout({ children }: RootLayoutProps) {
  const cookieStore = await cookies();
  const rawCity = cookieStore.get(CITY_COOKIE_NAME)?.value;
  const initialCity = parseCityCookieValue(rawCity) ?? DEFAULT_CITY;

  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-screen bg-[var(--cnc-bg)] font-sans text-[var(--cnc-text)] antialiased">
        <AppProviders initialCity={initialCity}>
          <div className="flex min-h-screen flex-col">
            <Suspense
              fallback={
                <div className="h-[78px] border-b border-[#E6EAF2] bg-white/95" aria-hidden />
              }
            >
              <PublicHeader />
            </Suspense>
            <LayoutChrome />
            <main id="main-content" className="flex-1">
              {children}
            </main>
            <PublicFooter />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
