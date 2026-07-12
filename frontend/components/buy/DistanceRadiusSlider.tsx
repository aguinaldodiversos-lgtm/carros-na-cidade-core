"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Slider de raio com SNAP em stops discretos (25/50/75/100 km por padrão),
 * espelhando o design de referência do painel de filtros.
 *
 * Comportamento (spec Passo 3):
 *   - trava apenas nos stops; arrastar, clicar na trilha e teclado
 *     (← → ↑ ↓ / Home / End) navegam entre eles;
 *   - balão azul + trilha preenchida acompanham o valor;
 *   - presets sincronizados nos dois sentidos;
 *   - marcador "Padrão" sob o stop default;
 *   - ARIA (`role=slider`, aria-valuenow/valuetext) atualizado a cada mudança.
 *
 * PERFORMANCE: cada `onChange` re-dispara a busca (router.push no pai). Por
 * isso NÃO comitamos a cada pointermove — durante o arraste só atualizamos o
 * estado visual local; o commit acontece no pointerup / clique / tecla. Isso
 * evita uma navegação por pixel arrastado.
 */

type DistanceRadiusSliderProps = {
  /** Stops permitidos, em ordem crescente (ex.: [25, 50, 75, 100]). */
  stops: readonly number[];
  /** Valor atual (km) — controlado pelo pai via `?raio=`. */
  value: number;
  /** Stop default; recebe o marcador "Padrão". */
  defaultValue: number;
  /** Dispara a busca com o novo raio (só em commit, não durante o arraste). */
  onChange: (km: number) => void;
  testId?: string;
};

// Inset das pontas para o thumb/label não “vazarem” a borda da trilha.
const EDGE_PAD = 6;

export function DistanceRadiusSlider({
  stops,
  value,
  defaultValue,
  onChange,
  testId,
}: DistanceRadiusSliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Encaixa qualquer valor no stop mais próximo (defesa contra ?raio= adulterado).
  const snap = useCallback(
    (km: number): number => {
      let best = stops[0];
      let bestD = Infinity;
      for (const s of stops) {
        const d = Math.abs(s - km);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      return best;
    },
    [stops]
  );

  // Estado visual local — desacopla o arraste da navegação (ver nota acima).
  const [local, setLocal] = useState<number>(() => snap(value));

  // Ressincroniza quando o pai confirma um novo raio (navegação concluída).
  useEffect(() => {
    setLocal(snap(value));
  }, [value, snap]);

  const pctOf = useCallback(
    (km: number): number => {
      const idx = Math.max(0, stops.indexOf(snap(km)));
      const span = stops.length > 1 ? idx / (stops.length - 1) : 0;
      return EDGE_PAD + span * (100 - 2 * EDGE_PAD);
    },
    [stops, snap]
  );

  const nearestFromClientX = useCallback(
    (clientX: number): number => {
      const el = sliderRef.current;
      if (!el) return local;
      const rect = el.getBoundingClientRect();
      const pct = rect.width > 0 ? ((clientX - rect.left) / rect.width) * 100 : 0;
      // Converte pct → índice de stop mais próximo (usando o mesmo mapeamento de pctOf).
      let best = stops[0];
      let bestD = Infinity;
      for (const s of stops) {
        const d = Math.abs(pctOf(s) - pct);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      return best;
    },
    [stops, pctOf, local]
  );

  const commit = useCallback(
    (km: number) => {
      const snapped = snap(km);
      setLocal(snapped);
      if (snapped !== snap(value)) onChange(snapped);
    },
    [snap, value, onChange]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      sliderRef.current?.setPointerCapture(e.pointerId);
      setLocal(nearestFromClientX(e.clientX)); // feedback imediato, sem commit
    },
    [nearestFromClientX]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      setLocal(nearestFromClientX(e.clientX)); // visual apenas
    },
    [nearestFromClientX]
  );

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    commit(local); // um único commit ao soltar / clicar
  }, [commit, local]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const idx = stops.indexOf(snap(local));
      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        if (idx < stops.length - 1) commit(stops[idx + 1]);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        if (idx > 0) commit(stops[idx - 1]);
      } else if (e.key === "Home") {
        e.preventDefault();
        commit(stops[0]);
      } else if (e.key === "End") {
        e.preventDefault();
        commit(stops[stops.length - 1]);
      }
    },
    [stops, snap, local, commit]
  );

  const activePct = pctOf(local);
  const scaleLabels = useMemo(
    () => stops.map((km) => ({ km, pct: pctOf(km) })),
    [stops, pctOf]
  );

  return (
    <div className="relative z-[1]">
      {/* Escala + balão do valor ativo */}
      <div className="relative mx-1 mb-1.5 h-6">
        {scaleLabels.map(({ km, pct }) =>
          km === local ? (
            <span
              key={`bubble-${km}`}
              className="absolute -top-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-primary px-2 py-1 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(14,98,216,0.28)] transition-[left] duration-150 motion-reduce:transition-none"
              style={{ left: `${pct}%` }}
              aria-hidden="true"
            >
              {km} km
            </span>
          ) : (
            <span
              key={`lbl-${km}`}
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[13px] font-semibold text-cnc-muted"
              style={{ left: `${pct}%` }}
              aria-hidden="true"
            >
              {km} km
            </span>
          )
        )}
      </div>

      {/* Slider */}
      <div
        ref={sliderRef}
        role="slider"
        tabIndex={0}
        aria-label="Raio de busca em quilômetros"
        aria-valuemin={stops[0]}
        aria-valuemax={stops[stops.length - 1]}
        aria-valuenow={local}
        aria-valuetext={`${local} km`}
        data-testid={testId}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        className="relative mx-1 h-6 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-cnc-line" />
        <div
          className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary transition-[width] duration-150 motion-reduce:transition-none"
          style={{ width: `${activePct}%` }}
        />
        <div
          className="absolute top-1/2 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-primary bg-white shadow-[0_2px_6px_rgba(14,98,216,0.35)] transition-[left] duration-150 motion-reduce:transition-none"
          style={{ left: `${activePct}%` }}
        />
      </div>

      {/* Presets sincronizados */}
      <div className="mt-6 grid grid-cols-4 gap-2.5">
        {stops.map((km) => {
          const active = km === local;
          return (
            <button
              key={`preset-${km}`}
              type="button"
              aria-pressed={active}
              onClick={() => commit(km)}
              className={
                active
                  ? "rounded-[11px] border border-primary bg-primary px-1.5 py-3 text-[14px] font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.20)]"
                  : "rounded-[11px] border border-primary/20 bg-white/75 px-1.5 py-3 text-[14px] font-bold text-primary transition hover:bg-white motion-reduce:transition-none"
              }
            >
              {km} km
            </button>
          );
        })}
      </div>

      {/* Marcador "Padrão" sob o stop default */}
      <div className="mt-2 grid grid-cols-4 gap-2.5">
        {stops.map((km) => (
          <span
            key={`tag-${km}`}
            className={`text-center text-[13px] font-semibold text-primary ${km === defaultValue ? "visible" : "invisible"}`}
          >
            Padrão
          </span>
        ))}
      </div>
    </div>
  );
}
