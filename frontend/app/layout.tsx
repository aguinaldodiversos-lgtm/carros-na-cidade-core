import type { Metadata, Viewport } from "next";
import "./globals.css";

import { PublicHeader } from "../components/shell/PublicHeader";
import { PublicFooter } from "../components/shell/PublicFooter";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.API_URL ||
  "https://carrosnacidade.com";

const SITE_NAME = "Carros na Cidade";
const DEFAULT_TITLE = "Carros na Cidade | Portal de carros da sua cidade";
const TITLE_TEMPLATE = "%s | Carros na Cidade";

const DEFAULT_DESCRIPTION =
  "Encontre carros usados e seminovos com busca inteligente, filtros avançados, oportunidades abaixo da FIPE e páginas locais por cidade no Carros na Cidade.";

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
];

const DEFAULT_OG_IMAGE = "/images/hero.jpeg";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e62d8",
  colorScheme: "light",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: DEFAULT_TITLE,
    template: TITLE_TEMPLATE,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: DEFAULT_KEYWORDS,
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
    url: SITE_URL,
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
    apple: ["/images/favicon.png"],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#f2f3f7] font-sans text-slate-900 antialiased">
        <div className="flex min-h-screen flex-col">
          <PublicHeader />
          <div className="flex-1">{children}</div>
          <PublicFooter />
        </div>
      </body>
    </html>
  );
}
