import type { BreadcrumbItem } from "@/lib/seo/page-structured-data";
import { buildBreadcrumbJsonLd } from "@/lib/seo/page-structured-data";

type BreadcrumbJsonLdProps = {
  items: BreadcrumbItem[];
};

export default function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
  if (!items.length) return null;

  const jsonLd = buildBreadcrumbJsonLd(items);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
