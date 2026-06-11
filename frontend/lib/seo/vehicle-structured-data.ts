// frontend/lib/seo/vehicle-structured-data.ts
//
// Fase 4.3 (§3) — JSON-LD do anúncio de veículo.
//
// O Google documenta Vehicle Listing como recurso de EUA/territórios; no
// Brasil usamos Product + Offer + Car de forma compatível (sem depender da
// eligibility específica). Emitimos UM nó com @type ["Product","Car"] que
// junta os campos de produto (brand, image, description, sku, offers) e de
// veículo (vehicleModelDate, mileageFromOdometer, fuelType,
// vehicleTransmission, color). Quando o anunciante é loja, o `seller` do
// Offer vira AutoDealer; a imagem principal vira um ImageObject com caption.
//
// Os dados aqui DEVEM bater com o conteúdo visível da página (§15).
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";
import { buildVehicleImageAlt, splitCityState } from "./vehicle-image-alt";

function parsePriceNumber(vehicle: VehicleDetail): number | null {
  if (
    typeof vehicle.priceNumeric === "number" &&
    Number.isFinite(vehicle.priceNumeric) &&
    vehicle.priceNumeric > 0
  ) {
    return vehicle.priceNumeric;
  }
  const digits = String(vehicle.price || "")
    .replace(/[^\d,]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseKm(vehicle: VehicleDetail): number | null {
  const n = Number(String(vehicle.km || "").replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fourDigitYear(raw: string): string {
  const m = String(raw || "").match(/\d{4}/);
  return m ? m[0] : "";
}

/** Monta o `seller` do Offer a partir do SellerInfo (AutoDealer p/ loja). */
function buildSeller(vehicle: VehicleDetail, siteUrl: string): Record<string, unknown> | undefined {
  const seller = vehicle.seller;
  if (!seller || !seller.name) return undefined;

  if (seller.type === "dealer") {
    const node: Record<string, unknown> = { "@type": "AutoDealer", name: seller.name };
    if (seller.phone) node.telephone = seller.phone;
    if (seller.address) {
      node.address = { "@type": "PostalAddress", streetAddress: seller.address };
    }
    if (seller.storeSlug) node.url = `${siteUrl}/lojas/${seller.storeSlug}`;
    return node;
  }
  // Particular: pessoa física (sem dados de contato sensíveis no schema).
  return { "@type": "Person", name: seller.name };
}

/**
 * Constrói o JSON-LD do anúncio como DOIS nós de TIPO ÚNICO (Fase 4.3.1):
 *   - Product (com Offer dentro) — OBRIGATÓRIO;
 *   - Car (specs do veículo) — quando há nome.
 *
 * Por que dois nós de tipo único em vez de um `@type: ["Product","Car"]`?
 * O array faz o veículo "sumir" da detecção por `"@type":"Product"` (Rich
 * Results, validadores e o smoke por regex) e o anúncio acaba lido só como
 * Thing (do WebPage.about). Tipos únicos garantem Product E Car detectáveis.
 *
 * §2: só inclui km/preço/cidade quando há dado real (bate com o visível).
 * Retorna `[]` se faltar dado essencial mínimo (nome).
 */
export function buildVehicleJsonLd(
  vehicle: VehicleDetail,
  opts: { url: string; siteUrl?: string }
): Record<string, unknown>[] {
  if (!vehicle || !vehicle.fullName) return [];

  const siteUrl = (opts.siteUrl || "https://www.carrosnacidade.com").replace(/\/+$/, "");
  const { city, state } = splitCityState(vehicle.city);
  const year = fourDigitYear(vehicle.year);
  const price = parsePriceNumber(vehicle);
  const km = parseKm(vehicle);
  const condition = vehicle.condition === "Novo" ? "NewCondition" : "UsedCondition";

  const alt = buildVehicleImageAlt({
    brand: vehicle.brand,
    model: vehicle.model,
    year,
    city,
    state,
  });

  // Imagem principal como ImageObject (com caption/alt); demais como URLs.
  const images = Array.isArray(vehicle.images) ? vehicle.images.filter(Boolean) : [];
  const imageField: unknown[] = [];
  if (images[0]) {
    imageField.push({ "@type": "ImageObject", url: images[0], caption: alt || vehicle.fullName });
  }
  for (const img of images.slice(1)) imageField.push(img);

  // ── Offer (dentro do Product) ──
  const offer: Record<string, unknown> = {
    "@type": "Offer",
    priceCurrency: "BRL",
    availability: "https://schema.org/InStock",
    itemCondition: `https://schema.org/${condition}`,
    url: opts.url,
  };
  if (price != null) offer.price = String(price);
  const seller = buildSeller(vehicle, siteUrl);
  if (seller) offer.seller = seller;

  // ── Product (tipo único — obrigatório) ──
  const product: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: vehicle.fullName,
    category: vehicle.condition === "Novo" ? "Veículo novo" : "Veículo usado",
    itemCondition: `https://schema.org/${condition}`,
    offers: offer,
  };
  if (vehicle.brand) product.brand = { "@type": "Brand", name: vehicle.brand };
  if (vehicle.model) product.model = vehicle.model;
  if (vehicle.adCode) product.sku = vehicle.adCode;
  if (imageField.length > 0) product.image = imageField;
  if (vehicle.description) product.description = vehicle.description;
  if (city) {
    product.areaServed = { "@type": "City", name: state ? `${city} - ${state}` : city };
  }

  // ── Car (tipo único — especificações do veículo) ──
  const car: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Car",
    name: vehicle.fullName,
  };
  if (vehicle.brand) car.brand = { "@type": "Brand", name: vehicle.brand };
  if (vehicle.model) car.model = vehicle.model;
  if (vehicle.version) car.vehicleConfiguration = vehicle.version;
  if (year) car.vehicleModelDate = year;
  if (vehicle.fuel) car.fuelType = vehicle.fuel;
  if (vehicle.transmission) car.vehicleTransmission = vehicle.transmission;
  if (vehicle.color) car.color = vehicle.color;
  if (vehicle.bodyType) car.bodyType = vehicle.bodyType;
  if (km != null) {
    car.mileageFromOdometer = { "@type": "QuantitativeValue", value: km, unitCode: "KMT" };
  }
  if (images.length > 0) car.image = images;

  return [product, car];
}
