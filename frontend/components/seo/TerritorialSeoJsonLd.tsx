import React from "react";

export type TerritorialSeoJsonLdProps = {
  url: string;
  title: string;
  description: string;
};

export function TerritorialSeoJsonLd({
  url,
  title,
  description,
}: TerritorialSeoJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    url,
    name: title,
    description,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default TerritorialSeoJsonLd;
