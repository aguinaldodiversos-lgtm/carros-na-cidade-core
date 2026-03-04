import type { Metadata } from "next";
import { cookies } from "next/headers";
import Image from "next/image";
import { redirect } from "next/navigation";
import BoostCheckout from "@/components/payments/BoostCheckout";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import { getAdByIdForUser, getBoostOptions } from "@/services/adService";
import { AUTH_COOKIE_NAME, getSessionUserFromCookieValue } from "@/services/sessionService";

type ImpulsionarPageProps = {
  params: {
    adId: string;
  };
  searchParams?: {
    option?: string;
  };
};

export const metadata: Metadata = {
  title: "Impulsionar anuncio",
  description: "Ative destaque de 7 ou 30 dias para seu anuncio com pagamento Mercado Pago.",
};

export const dynamic = "force-dynamic";

function formatPrice(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString("pt-BR");
}

export default function ImpulsionarPage({ params, searchParams }: ImpulsionarPageProps) {
  const cookieStore = cookies();
  const session = getSessionUserFromCookieValue(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session) {
    redirect("/login");
  }

  const ad = getAdByIdForUser(params.adId, session.id);
  if (!ad) {
    redirect(session.type === "CNPJ" ? "/dashboard-loja" : "/dashboard");
  }

  const options = getBoostOptions();

  return (
    <>
      <Header />

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="mb-5 rounded-2xl border border-[#dfe4ef] bg-white p-4 shadow-[0_3px_18px_rgba(10,20,40,0.06)] sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-[#5e6983]">Impulsionamento de anuncio</p>
          <h1 className="mt-1 text-2xl font-extrabold text-[#1d2538]">Pagamento de destaque</h1>
          <p className="mt-2 text-sm text-[#5b6781]">
            Ao aprovar o pagamento, o anuncio recebe badge de destaque, prioridade alta e recalculo de ranking no Cerebro IA.
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <article className="overflow-hidden rounded-2xl border border-[#dfe4ef] bg-white shadow-[0_3px_18px_rgba(10,20,40,0.07)]">
            <div className="relative h-[220px]">
              <Image src={ad.image_url} alt={ad.title} fill className="object-cover" />
            </div>
            <div className="space-y-3 p-4 sm:p-5">
              <h2 className="text-xl font-extrabold text-[#1d2538]">{ad.title}</h2>
              <p className="text-3xl font-extrabold text-[#0e62d8]">{formatPrice(ad.price)}</p>
              <div className="grid gap-2 rounded-xl border border-[#e2e8f2] bg-[#f8fafe] p-3 text-sm text-[#4e5b75] sm:grid-cols-2">
                <p>
                  <strong className="font-bold text-[#1f2c47]">Status:</strong> {ad.status === "active" ? "Ativo" : "Pausado"}
                </p>
                <p>
                  <strong className="font-bold text-[#1f2c47]">Visualizacoes:</strong> {ad.views.toLocaleString("pt-BR")}
                </p>
                <p>
                  <strong className="font-bold text-[#1f2c47]">Destaque:</strong> {ad.is_featured ? "Sim" : "Nao"}
                </p>
                <p>
                  <strong className="font-bold text-[#1f2c47]">Validade atual:</strong> {formatDate(ad.featured_until)}
                </p>
              </div>
            </div>
          </article>

          <BoostCheckout adId={ad.id} options={options} defaultOptionId={searchParams?.option} />
        </div>
      </main>

      <Footer />
    </>
  );
}
