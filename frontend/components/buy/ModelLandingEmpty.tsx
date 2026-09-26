import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * Estado vazio da landing — Server Component.
 *
 * Duas situações, duas saídas:
 *   - o visitante filtrou e nada sobrou → a saída é limpar os filtros (a URL
 *     limpa da própria landing);
 *   - o motor não encontrou o modelo nem na região → diz isso sem rodeio e
 *     oferece a marca e a cidade. A página nesse caso é `noindex` e não mostra
 *     indicador nem bloco de estoque: não existe "comprar HB20 em X" sem HB20.
 */

type ModelLandingEmptyProps = {
  vehicle: string;
  cityName: string;
  hasFilters: boolean;
  clearHref: string;
  brandLink: { label: string; href: string };
  cityLink: { label: string; href: string };
};

export function ModelLandingEmpty({
  vehicle,
  cityName,
  hasFilters,
  clearHref,
  brandLink,
  cityLink,
}: ModelLandingEmptyProps) {
  const title = hasFilters
    ? `Nenhum ${vehicle} combina com esses filtros`
    : `Nenhum ${vehicle} à venda em ${cityName} e região no momento`;
  const body = hasFilters
    ? "Afrouxe ou limpe os filtros para voltar a ver todos os anúncios deste modelo."
    : "O estoque muda todos os dias. Enquanto isso, veja outros carros da marca e da cidade.";

  return (
    <Card
      variant="flat"
      padding="lg"
      data-testid="model-landing-empty"
      className="flex flex-col items-center justify-center text-center"
    >
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-primary">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-8 w-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            d="M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="mt-4 text-lg font-bold text-cnc-text-strong sm:text-xl">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-cnc-muted">{body}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {hasFilters ? (
          <Button href={clearHref} variant="primary" size="md">
            Limpar filtros
          </Button>
        ) : null}
        <Button href={brandLink.href} variant={hasFilters ? "secondary" : "primary"} size="md">
          {brandLink.label}
        </Button>
        <Link
          href={cityLink.href}
          className="text-sm font-semibold text-primary hover:text-primary-strong"
        >
          {cityLink.label} →
        </Link>
      </div>
    </Card>
  );
}
