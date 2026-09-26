"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

/**
 * Gaveta inferior (bottom sheet) de filtros no mobile.
 *
 * Mesma forma da gaveta que o catálogo monta inline em
 * `BuyMarketplacePageClient` — cabeçalho "Filtros | Fechar", painel de 90vh
 * com rolagem própria —, mais o que um diálogo modal precisa ter para teclado
 * e leitor de tela:
 *
 *   - `role="dialog"` + `aria-modal` + título ligado por `aria-labelledby`;
 *   - foco vai para o botão Fechar ao abrir e VOLTA para quem abriu ao fechar;
 *   - Tab/Shift+Tab ficam presos dentro do painel;
 *   - Esc fecha; clique no fundo escurecido fecha;
 *   - a página atrás não rola enquanto a gaveta está aberta.
 *
 * Só existe no DOM quando aberta: a sidebar do desktop já está no HTML, e
 * manter uma segunda instância montada duplicaria os campos para nada.
 */

type FilterDrawerProps = {
  id: string;
  open: boolean;
  onClose: () => void;
  title: string;
  /** Elemento que abriu a gaveta — recebe o foco de volta ao fechar. */
  returnFocusRef?: RefObject<HTMLElement>;
  children: ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function FilterDrawer({
  id,
  open,
  onClose,
  title,
  returnFocusRef,
  children,
}: FilterDrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const returnTarget = returnFocusRef?.current ?? null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnTarget?.focus();
    };
  }, [open, returnFocusRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Fundo: clique fecha. Não é focável — Esc e o botão Fechar cobrem o teclado. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cnc-text-strong/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        id={id}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-hidden rounded-t-2xl bg-cnc-surface shadow-premium-lg"
      >
        <div className="flex items-center justify-between border-b border-cnc-line px-4 py-3">
          <h2 id={titleId} className="text-base font-bold text-cnc-text-strong">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-primary hover:text-primary-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Fechar
          </button>
        </div>
        <div className="max-h-[calc(90vh-52px)] overflow-y-auto overscroll-contain px-3 pb-8 pt-3">
          {children}
        </div>
      </div>
    </div>
  );
}
