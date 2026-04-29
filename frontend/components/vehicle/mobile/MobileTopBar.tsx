// frontend/components/vehicle/mobile/MobileTopBar.tsx
"use client";

import { useRouter } from "next/navigation";

/**
 * Top bar mobile da rota /veiculo. Substitui o PublicHeader global em
 * telas < lg. Espelha o mockup `detalhes.png`:
 *
 *   ←  Detalhes do veículo                       ⤴︎  ♡
 *
 * - back: history.back() com fallback para "/"
 * - share: Web Share API com fallback para clipboard
 * - heart: stub visual (favoritar entra em outra rotina)
 */

type MobileTopBarProps = {
  /** URL canônica desta página (para Web Share / clipboard). */
  shareUrl: string;
  /** Texto a compartilhar (modelo + cidade). */
  shareText: string;
};

function ArrowLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <path d="M16 6 12 2 8 6" />
      <path d="M12 2v14" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
    </svg>
  );
}

export default function MobileTopBar({ shareUrl, shareText }: MobileTopBarProps) {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/comprar");
    }
  }

  async function handleShare() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: shareText, url: shareUrl });
        return;
      } catch {
        // usuário cancelou ou plataforma sem suporte → cai no fallback
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        /* noop */
      }
    }
  }

  return (
    <header
      data-vehicle-mobile-topbar
      className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200/80 bg-white/95 px-3 backdrop-blur-md"
    >
      <button
        type="button"
        onClick={handleBack}
        aria-label="Voltar"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:bg-slate-200"
      >
        <ArrowLeftIcon />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-[16px] font-extrabold leading-tight text-slate-900">
        Detalhes do veículo
      </h1>
      <button
        type="button"
        onClick={handleShare}
        aria-label="Compartilhar"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:bg-slate-200"
      >
        <ShareIcon />
      </button>
      <button
        type="button"
        aria-label="Favoritar"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:bg-slate-200"
      >
        <HeartIcon />
      </button>
    </header>
  );
}
