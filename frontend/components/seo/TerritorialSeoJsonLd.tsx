import React from "react";

export type TerritorialSeoJsonLdProps = {
  data: any;
  mode?: string;
};

export function TerritorialSeoJsonLd({
  data,
  mode,
}: TerritorialSeoJsonLdProps) {
  if (!data) return null;

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://carrosnacidade.com";

  const pageUrl =
    typeof window === "undefined"
      ? baseUrl
      : `${baseUrl}${window.location.pathname}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: data?.seo?.title || "Carros na Cidade",
    description:
      data?.seo?.description ||
      "Carros usados e seminovos na sua cidade.",
    url: pageUrl,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default TerritorialSeoJsonLd;
