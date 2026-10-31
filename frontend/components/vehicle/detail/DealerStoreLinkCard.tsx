import Image from "next/image";
import Link from "next/link";

import type { SellerDealer } from "@/lib/vehicle/public-vehicle";

type DealerStoreLinkCardProps = {
  seller: SellerDealer;
  city: string;
};

function StorefrontIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 10h18l-1.7-6H4.7L3 10Z" />
      <path d="M4 10v10h16V10M9 20v-7h6v7" />
      <path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </svg>
  );
}

export default function DealerStoreLinkCard({ seller, city }: DealerStoreLinkCardProps) {
  const name = seller.name || "Loja anunciante";
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "L";
  const href = seller.storeSlug ? `/lojas/${encodeURIComponent(seller.storeSlug)}` : null;

  return (
    <section
      aria-label="Loja anunciante"
      className="rounded-2xl border border-cnc-line bg-white p-4 shadow-card"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <StorefrontIcon />
        </span>
        <h2 className="text-[15px] font-extrabold text-cnc-text-strong">Loja anunciante</h2>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#27303b] bg-[#161b23] text-lg font-extrabold text-white">
          {seller.logo ? (
            <Image
              src={seller.logo}
              alt={`Logotipo da ${name}`}
              width={76}
              height={76}
              unoptimized
              sizes="76px"
              className="h-full w-full object-contain"
            />
          ) : (
            <span aria-label={`Iniciais da ${name}`}>{initials}</span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="break-words text-[17px] font-extrabold leading-tight text-cnc-text-strong">
            {name}
          </p>
          {city ? (
            <p className="mt-1 flex items-center gap-1 text-[12.5px] text-cnc-muted">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0 text-primary"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                aria-hidden="true"
              >
                <path d="M12 22s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span className="truncate">{city}</span>
            </p>
          ) : null}
          <p className="mt-1 text-[12px] text-cnc-muted">Loja / Revenda</p>
        </div>
      </div>

      {href ? (
        <>
          <p className="mt-3 text-[12.5px] leading-relaxed text-cnc-muted">
            Veja o perfil da loja, o estoque completo e outras ofertas.
          </p>
          <Link
            href={href}
            aria-label={`Ver página da loja ${name}`}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-[13.5px] font-extrabold text-white transition hover:bg-primary-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <StorefrontIcon className="h-4 w-4" />
            Ver página da loja
            <ArrowRightIcon />
          </Link>
        </>
      ) : (
        <p className="mt-3 text-[12.5px] text-cnc-muted">
          Perfil público da loja indisponível no momento.
        </p>
      )}
    </section>
  );
}
