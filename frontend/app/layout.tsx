import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Carros na Cidade | Encontre seu proximo carro",
    template: "%s | Carros na Cidade",
  },
  description:
    "Portal automotivo com anuncios de carros novos e seminovos em Sao Paulo.",
  metadataBase: new URL("https://carrosnacidade.com"),
  openGraph: {
    title: "Carros na Cidade",
    description:
      "Encontre carros usados e seminovos com busca rapida e filtros inteligentes.",
    siteName: "Carros na Cidade",
    type: "website",
    locale: "pt_BR",
  },
  icons: {
    icon: "/images/favicon.ico",
    shortcut: "/images/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className="min-h-screen bg-[#f2f3f7] font-sans text-slate-900"
      >
        {children}
      </body>
    </html>
  );
}
