import Link from "next/link";

export type CatalogBreadcrumbItem = {
  label: string;
  href?: string;
};

type CatalogBreadcrumbProps = {
  items: CatalogBreadcrumbItem[];
};

export function CatalogBreadcrumb({ items }: CatalogBreadcrumbProps) {
  return (
    <nav aria-label="Navegação" className="text-[13px] font-medium text-slate-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <Link href={item.href} className="transition hover:text-blue-700">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined} className={isLast ? "font-semibold text-slate-700" : ""}>
                  {item.label}
                </span>
              )}
              {!isLast ? (
                <svg
                  viewBox="0 0 20 20"
                  className="h-3.5 w-3.5 text-slate-300"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="m7 5 6 5-6 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
