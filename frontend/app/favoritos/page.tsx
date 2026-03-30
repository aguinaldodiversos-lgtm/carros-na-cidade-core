"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getFavoriteSlugs } from "@/lib/favorites/local-favorites";
import { SITE_ROUTES } from "@/lib/site/site-navigation";

export default function FavoritosPage() {
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setSlugs(getFavoriteSlugs());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("cnc-favorites-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("cnc-favorites-changed", sync as EventListener);
    };
  }, []);

  const empty = slugs.length === 0;

  const links = useMemo(
    () =>
      slugs.map((slug) => ({
        slug,
        href: `/comprar/${encodeURIComponent(slug)}`,
      })),
    [slugs]
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-[#1b2436] md:text-3xl">
        Favoritos
      </h1>
      <p className="mt-2 text-[15px] text-[#6a7388]">
        Anúncios que você salvou neste dispositivo. Faça login para sincronizar entre aparelhos
        quando disponível.
      </p>

      {empty ? (
        <div className="mt-10 rounded-2xl border border-[#e6eaf2] bg-white p-8 text-center shadow-sm">
          <p className="text-[15px] font-medium text-[#4e5a73]">Nenhum favorito ainda.</p>
          <p className="mt-2 text-sm text-[#6a7388]">
            Toque no coração nos cards da home ou nas páginas de veículo para guardar aqui.
          </p>
          <Link
            href={SITE_ROUTES.comprar}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-[10px] bg-[#0e62d8] px-6 text-sm font-bold text-white hover:bg-[#0c4fb0]"
          >
            Explorar anúncios
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {links.map(({ slug, href }) => (
            <li key={slug}>
              <Link
                href={href}
                className="flex items-center justify-between rounded-xl border border-[#e6eaf2] bg-white px-4 py-3 text-sm font-semibold text-[#1b2436] shadow-sm transition hover:border-[#0e62d8]/30"
              >
                <span className="truncate">{slug.replace(/-/g, " ")}</span>
                <span className="text-[#0e62d8]">Ver →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
