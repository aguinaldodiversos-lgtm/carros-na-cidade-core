import type { Metadata } from "next";

import StoreProfileForm from "@/components/account/StoreProfileForm";
import {
  BackendApiError,
  fetchStoreProfile,
  type StoreProfile,
} from "@/lib/account/backend-account";
import { requireLojistaDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Dados da loja",
  description: "Atualize os dados de contato da sua loja — Carros na Cidade.",
};

export const dynamic = "force-dynamic";

export default async function DadosDaLojaPage() {
  const session = await requireLojistaDashboardSession();

  let store: StoreProfile | null = null;
  let loadError: "not_found" | "generic" | null = null;

  try {
    const res = await fetchStoreProfile(session);
    store = res.store;
  } catch (error) {
    loadError = error instanceof BackendApiError && error.status === 404 ? "not_found" : "generic";
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-[#0f172a]">Dados da loja</h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Estas informações aparecem nos seus anúncios e são o canal de contato com os compradores.
        </p>
      </header>

      {store ? (
        <StoreProfileForm initial={store} />
      ) : loadError === "not_found" ? (
        <div className="rounded-2xl border border-[#e8ecf4] bg-white p-6 text-sm text-[#475569] shadow-sm">
          Sua loja ainda não está configurada. Publique um anúncio para criar o cadastro da loja —
          depois você poderá editar os dados por aqui.
        </div>
      ) : (
        <div className="rounded-2xl border border-[#F4C7C3] bg-[#FFF4F3] p-6 text-sm font-medium text-[#B42318]">
          Não foi possível carregar os dados da sua loja agora. Recarregue a página em instantes.
        </div>
      )}
    </div>
  );
}
