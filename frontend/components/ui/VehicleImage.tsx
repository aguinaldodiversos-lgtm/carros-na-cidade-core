// frontend/components/ui/VehicleImage.tsx
"use client";

import Image from "next/image";
import { useState, useCallback } from "react";
import { shouldSkipNextImageOptimizer } from "@/lib/images/image-optimization";
import { LISTING_CARD_FALLBACK_IMAGE } from "@/lib/vehicle/detail-utils";
import { VehicleImagePlaceholder } from "./VehicleImagePlaceholder";

/**
 * Componente OFICIAL e ÚNICO de imagem de veículo/anúncio.
 *
 * Compatibilidade (DIAGNOSTICO_REDESIGN.md §8.5):
 *   - URLs R2 absolutas (https://r2...)
 *   - Proxy /api/vehicle-images?key=... e ?src=...
 *   - URLs legadas /uploads/... (servidas via /api/vehicle-images)
 *   - URLs externas (HTTPS)
 *   - data: URIs (sem otimização)
 *   - SVG (sem otimização)
 *   - String vazia / null / undefined → placeholder
 *
 * Comportamento crítico:
 *   - sizes obrigatório (default por variant); sem CLS.
 *   - priority apenas se prop priority=true (uso restrito a imagem
 *     acima da dobra; máximo 1-2 por página).
 *   - lazy loading default (next/image).
 *   - onError → swap silencioso para <VehicleImagePlaceholder>
 *     mantendo width/height para zero layout shift.
 *
 * NÃO substitui ainda os usos existentes (AdCard etc.) — PR F faz isso.
 */

type VehicleImageVariant = "card" | "gallery" | "thumb" | "hero";

const DEFAULT_SIZES: Record<VehicleImageVariant, string> = {
  card: "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  gallery: "(max-width: 768px) 100vw, 800px",
  thumb: "96px",
  hero: "100vw",
};

export type VehicleImageProps = {
  /** URL da imagem. Aceita qualquer formato suportado (R2, /api/vehicle-images, /uploads, externa, data:). */
  src: string | null | undefined;
  /** Texto alt obrigatório (a11y). Use string vazia se decorativa. */
  alt: string;
  /** Largura em px (obrigatória para evitar CLS). */
  width: number;
  /** Altura em px (obrigatória). */
  height: number;
  /** Pré-set responsivo. Cada variant tem `sizes` default. */
  variant?: VehicleImageVariant;
  /** Override de sizes — se não passado, usa default da variant. */
  sizes?: string;
  /**
   * Apenas para imagem acima da dobra (hero, primeiro card).
   * Default: false. Máximo recomendado: 1-2 por página.
   */
  priority?: boolean;
  /** Classes para o container externo (não para a img em si). */
  className?: string;
  /** Hook opcional para parent reagir ao erro. */
  onError?: () => void;
  /** Texto curto exibido no placeholder em estado de erro. */
  fallbackLabel?: string;
};

function isPlaceholderSource(src: string | null | undefined): boolean {
  if (!src) return true;
  const trimmed = src.trim();
  if (!trimmed) return true;
  // Se já é o fallback SVG conhecido, mostrar placeholder estilizado em vez do SVG raw.
  if (trimmed === LISTING_CARD_FALLBACK_IMAGE) return true;
  return false;
}

export function VehicleImage({
  src,
  alt,
  width,
  height,
  variant = "card",
  sizes,
  priority = false,
  className = "",
  onError,
  fallbackLabel,
}: VehicleImageProps) {
  const [errored, setErrored] = useState(false);

  const handleError = useCallback(() => {
    setErrored(true);
    onError?.();
  }, [onError]);

  // Sem fonte → placeholder direto (sem nem tentar carregar).
  if (isPlaceholderSource(src) || errored) {
    return (
      <VehicleImagePlaceholder
        width={width}
        height={height}
        label={errored ? (fallbackLabel ?? "Imagem indisponível") : (fallbackLabel ?? "Sem foto")}
        className={className}
      />
    );
  }

  const finalSrc = (src as string).trim();
  // Pula `/_next/image` quando o ganho do otimizador é nulo (SVG, data:) ou
  // quando re-otimizar geraria caminho duplo Render→Render (proxy próprio,
  // /uploads, CDN R2, *.onrender.com). Ver lib/images/image-optimization.ts.
  const skipOptimizer = shouldSkipNextImageOptimizer(finalSrc);
  const finalSizes = sizes ?? DEFAULT_SIZES[variant];

  return (
    <Image
      src={finalSrc}
      alt={alt}
      width={width}
      height={height}
      sizes={finalSizes}
      priority={priority}
      // next/image gerencia loading="lazy" sozinho quando priority=false.
      // Em priority=true vira eager + fetchpriority=high automaticamente.
      unoptimized={skipOptimizer}
      onError={handleError}
      className={className}
    />
  );
}
