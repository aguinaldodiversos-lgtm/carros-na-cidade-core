import Link from "next/link";
import type { BreadcrumbItem } from "@/lib/seo/page-structured-data";

type PageBreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export default function PageBreadcrumbs({ items, className = "" }: PageBreadcrumbsProps) {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-2 text-sm text-[#5f6982]">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.name}-${item.href || index}`} className="flex items-center gap-2">
              {isLast || !item.href ? (
                <span className="font-semibold text-[#2b3650]">{item.name}</span>
              ) : (
                <Link href={item.href} className="hover:text-[#0e62d8]">
                  {item.name}
                </Link>
              )}
              {!isLast ? <span>/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
