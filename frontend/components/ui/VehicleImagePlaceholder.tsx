// frontend/components/ui/VehicleImagePlaceholder.tsx

/**
 * Placeholder oficial para imagens de veículos quando:
 *   - anúncio não tem imagem;
 *   - imagem falhou ao carregar (onError);
 *   - imagem está em estado de loading e ainda não tem blur.
 *
 * Premium: SVG inline (carro estilizado), fundo neutro, sem broken image.
 *
 * Server Component: nada de estado/efeito.
 *
 * REGRA: width e height são obrigatórios (em px) para ZERO CLS.
 * O placeholder ocupa exatamente o mesmo espaço que a imagem teria,
 * evitando layout shift quando a imagem real falha.
 *
 * Inline `style` é exceção justificada para dimensões dinâmicas:
 * Tailwind não cobre todos os tamanhos arbitrários, e o consumidor
 * passa width/height variáveis. As cores e tipografia continuam Tailwind.
 */

import type { CSSProperties } from "react";

export type VehicleImagePlaceholderProps = {
  width: number;
  height: number;
  /** Texto opcional embaixo do ícone (ex: "Sem foto", "Erro ao carregar"). */
  label?: string;
  /** Aria-label do bloco. Default: "Imagem indisponível". */
  ariaLabel?: string;
  className?: string;
};

function CarSvg() {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-1/3 w-1/3 opacity-60"
    >
      <path d="M10 38h44" />
      <path d="M14 38v6a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2" />
      <path d="M42 44v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-6" />
      <path d="M14 38l4-12a4 4 0 0 1 4-3h20a4 4 0 0 1 4 3l4 12" />
      <circle cx="20" cy="38" r="3" />
      <circle cx="44" cy="38" r="3" />
    </svg>
  );
}

export function VehicleImagePlaceholder({
  width,
  height,
  label,
  ariaLabel = "Imagem indisponível",
  className = "",
}: VehicleImagePlaceholderProps) {
  // Inline style apenas para dimensões dinâmicas (zero CLS); cores/spacing via Tailwind.
  const style: CSSProperties = {
    width: `${width}px`,
    height: `${height}px`,
  };

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={style}
      className={`flex shrink-0 flex-col items-center justify-center gap-1 bg-cnc-bg text-cnc-muted-soft ${className}`.trim()}
    >
      <CarSvg />
      {label && (
        <span className="px-2 text-center text-[10px] font-medium uppercase tracking-wideish text-cnc-muted">
          {label}
        </span>
      )}
    </div>
  );
}
