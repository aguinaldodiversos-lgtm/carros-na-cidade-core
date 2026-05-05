import type { Metadata } from "next";
import SellPageClient from "@/components/sell/SellPageClient";
import { getSellPageContent } from "@/lib/sell/sell-page";

export const revalidate = 60;

/**
 * Metadata da página /anunciar.
 *
 * O canonical EXPLICITAMENTE aponta para `/anunciar`. Sem este export,
 * a página herda `alternates.canonical: "/"` do `app/layout.tsx` (root
 * metadata), o que faz o Googlebot enxergar `/anunciar` como variante
 * da home — sinal contraditório que prejudica indexação da página de
 * conversão. Mantemos o canonical estável para sinal SEO consistente.
 *
 * NÃO trocar este canonical sem decisão explícita: alterar o canonical
 * de uma página de conversão pública impacta SEO comercial.
 */
export const metadata: Metadata = {
  title: "Anuncie seu carro",
  description:
    "Publique seu veículo no Carros na Cidade com presença regional, FIPE, contato direto via WhatsApp e ferramentas para particular e lojista.",
  alternates: { canonical: "/anunciar" },
};

export default async function AnunciarPage() {
  const content = await getSellPageContent();

  return <SellPageClient content={content} />;
}
