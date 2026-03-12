import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import VehicleCarousel from "@/components/common/VehicleCarousel";
import VehicleActions from "@/components/vehicle/VehicleActions";
import VehicleGallery from "@/components/vehicle/VehicleGallery";
import VehicleInfo from "@/components/vehicle/VehicleInfo";
import SellerSection from "@/components/vehicle/SellerSection";
import VehicleSpecs from "@/components/vehicle/VehicleSpecs";
import { fetchAdDetail } from "@/lib/ads/ad-detail";
import {
  adaptAdDetailToVehicle,
  buildCityVehicles,
  buildSellerVehicles,
} from "@/lib/vehicle/public-vehicle";
import {
  getAISimilarVehicles,
  getAIVehicleInsights,
  getAIVehiclePriceSignal,
} from "@/services/aiService";

type PageProps = {
  params: { slug: string };
};

export const revalidate = 1800;
export const dynamicParams = true;

const getPublicVehicleDetail = cache(async (slug: string) => {
  return adaptAdDetailToVehicle(await fetchAdDetail(slug));
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const vehicle = await getPublicVehicleDetail(params.slug);
  const [cityName] = vehicle.city.split(" (");

  return {
    title: `${vehicle.model} ${vehicle.year.split("/")[0]} à venda em ${cityName}`,
    description: `${vehicle.fullName} por ${vehicle.price} em ${vehicle.city}. Confira ficha completa, fotos e simulação de financiamento.`,
    alternates: {
      canonical: `/veiculo/${vehicle.slug}`,
    },
    openGraph: {
      title: `${vehicle.model} ${vehicle.year.split("/")[0]} à venda em ${cityName}`,
      description: `${vehicle.fullName} anunciado por ${vehicle.price} em ${vehicle.city}.`,
      url: `/veiculo/${vehicle.slug}`,
      images: [
        {
          url: vehicle.images[0] ?? "/images/banner1.jpg",
          width: 1200,
          height: 630,
          alt: vehicle.fullName,
        },
      ],
      locale: "pt_BR",
      type: "website",
    },
    keywords: [
      `${vehicle.model.toLowerCase()} ${cityName.toLowerCase()}`,
      `comprar ${vehicle.model.toLowerCase()} ${cityName.toLowerCase()}`,
      `veículo ${cityName.toLowerCase()}`,
    ],
  };
}

export default async function VehicleDetailPage({ params }: PageProps) {
  const vehicle = await getPublicVehicleDetail(params.slug);

  const [priceSignal, aiInsights, sellerVehicles, cityVehicles, similarVehicles] =
    await Promise.all([
      getAIVehiclePriceSignal(vehicle),
      getAIVehicleInsights(vehicle),
      Promise.resolve(buildSellerVehicles(vehicle)),
      Promise.resolve(buildCityVehicles(vehicle)),
      getAISimilarVehicles(vehicle),
    ]);

  const schemaVehicle = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: vehicle.fullName,
    model: vehicle.model,
    vehicleModelDate: vehicle.year.split("/")[0],
    fuelType: vehicle.fuel,
    vehicleTransmission: vehicle.transmission,
    color: vehicle.color,
    mileageFromOdometer: {
      "@type": "QuantitativeValue",
      value: vehicle.km.replace(/\D/g, ""),
      unitCode: "KMT",
    },
    image: vehicle.images,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: vehicle.price.replace(/[^\d,]/g, "").replace(".", "").replace(",", "."),
      availability: "https://schema.org/InStock",
      url: `https://carrosnacidade.com/veiculo/${vehicle.slug}`,
    },
  };

  const schemaBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://carrosnacidade.com/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Anúncios",
        item: "https://carrosnacidade.com/anuncios",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: vehicle.model,
        item: `https://carrosnacidade.com/veiculo/${vehicle.slug}`,
      },
    ],
  };

  const schemaFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Como simular financiamento deste veículo?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Use o botão Simular financiamento para abrir o simulador com os dados do anúncio.",
        },
      },
      {
        "@type": "Question",
        name: "Este anúncio está abaixo da FIPE?",
        acceptedAnswer: {
          "@type": "Answer",
          text: vehicle.isBelowFipe
            ? "Sim. O valor anunciado está abaixo da referência FIPE atual."
            : "O valor está alinhado com a referência FIPE para este modelo.",
        },
      },
    ],
  };

  const sellerPhone = vehicle.seller.phone;

  return (
    <>
      <main className="mx-auto w-full max-w-7xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 md:pb-8 md:pt-8">
        <nav
          aria-label="Breadcrumb"
          className="mb-4 overflow-x-auto whitespace-nowrap text-sm text-[#5f6982]"
        >
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="hover:text-[#0e62d8]">
                Home
              </Link>
            </li>
            <li>/</li>
            <li>
              <Link href="/anuncios" className="hover:text-[#0e62d8]">
                Anúncios
              </Link>
            </li>
            <li>/</li>
            <li className="font-semibold text-[#2b3650]">{vehicle.model}</li>
          </ol>
        </nav>

        <div className="grid gap-4 md:gap-5 xl:grid-cols-[1.45fr_1fr]">
          <VehicleGallery images={vehicle.images} alt={vehicle.fullName} />
          <div className="space-y-5">
            <VehicleInfo vehicle={vehicle} priceSignal={priceSignal} />
            <VehicleActions
              vehicleId={vehicle.id}
              vehicleName={vehicle.fullName}
              whatsappPhone={sellerPhone}
            />
          </div>
        </div>

        <div className="mt-5">
          <VehicleSpecs vehicle={vehicle} aiInsights={aiInsights} />
        </div>

        <div className="mt-5">
          <SellerSection
            vehicle={vehicle}
            sellerVehicles={sellerVehicles}
            cityVehicles={cityVehicles}
          />
        </div>

        <VehicleCarousel
          title="Veículos semelhantes sugeridos pelo Cérebro IA"
          subtitle="Modelos com perfil de preço, liquidez e procura parecidos com este anúncio."
          vehicles={similarVehicles}
        />
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaVehicle) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaBreadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaFaq) }}
      />
    </>
  );
}
