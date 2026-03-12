import { toAbsoluteUrl } from "./site";

export type BreadcrumbItem = {
  name: string;
  href?: string;
};

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: toAbsoluteUrl(item.href || "/"),
    })),
  };
}

export function buildWebPageJsonLd(input: {
  title: string;
  description: string;
  path: string;
  type?: "WebPage" | "CollectionPage" | "AboutPage";
  about?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": input.type || "WebPage",
    name: input.title,
    description: input.description,
    url: toAbsoluteUrl(input.path),
    inLanguage: "pt-BR",
    isPartOf: {
      "@type": "WebSite",
      name: "Carros na Cidade",
      url: toAbsoluteUrl("/"),
    },
    about: input.about
      ? {
          "@type": "Thing",
          name: input.about,
        }
      : undefined,
  };
}
