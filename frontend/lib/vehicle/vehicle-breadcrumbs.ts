import type { BreadcrumbItem } from "@/lib/seo/page-structured-data";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";

/**
 * Trilha da página de veículo: `Home > Comprar > Atibaia (SP) > Onix Hatch…`
 *
 * POR QUE A CIDADE ENTROU AQUI (2026-07-26)
 *
 * O Search Console reportava `/carros-em/atibaia-sp` como "Detectada, mas não
 * indexada" com "Página de referência: Nenhuma página foi detectada" — e a
 * auditoria confirmou: ZERO links internos para a página de cidade em todo o
 * site. O rodapé linkava 6 cidades sem estoque e nenhuma com.
 *
 * As páginas de veículo já estão indexadas e são rastreadas com frequência.
 * Pôr a cidade no breadcrumb faz cada uma delas apontar para a página de
 * cidade — link interno vindo de página que o Google já visita, que pesa mais
 * que sitemap.
 *
 * Um array, dois consumidores: o `<Breadcrumb>` visual (que renderiza item
 * com `href` como `<Link>`) e o `<BreadcrumbJsonLd>` (`BreadcrumbList`). Um
 * item novo enriquece os dois de uma vez.
 *
 * GUARD: anúncio sem cidade resolvida tem `citySlug === ""` (o
 * `deriveCitySlug` NÃO inventa "sao-paulo-sp" desde o briefing P0 de
 * 2026-05-24) e `city === "Localização não informada"`. Nesse caso o item é
 * OMITIDO — em vez de emitir um link quebrado para `/carros-em/` e um
 * `BreadcrumbList` com "Localização não informada" dentro.
 */

/** Rótulo que `buildPublicTerritoryLabel` devolve quando não há cidade nem UF. */
const LABEL_SEM_LOCALIZACAO = "Localização não informada";

export function buildVehicleBreadcrumbs(vehicle: VehicleDetail): BreadcrumbItem[] {
  const citySlug = (vehicle.citySlug || "").trim();
  const cityLabel = (vehicle.city || "").trim();

  const temCidade = Boolean(citySlug) && Boolean(cityLabel) && cityLabel !== LABEL_SEM_LOCALIZACAO;

  return [
    { name: "Home", href: "/" },
    { name: "Comprar", href: "/comprar" },
    ...(temCidade ? [{ name: cityLabel, href: `/carros-em/${encodeURIComponent(citySlug)}` }] : []),
    // Último item sem href: é a página atual (o renderer visual o marca como
    // texto, não link, e o JSON-LD usa a própria URL).
    { name: vehicle.model },
  ];
}
