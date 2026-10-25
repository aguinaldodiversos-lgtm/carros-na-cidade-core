import type { Metadata } from "next";
import PersonalProfileForm from "@/components/account/PersonalProfileForm";
import { fetchPersonalProfile } from "@/lib/account/backend-account";
import { requirePfDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Dados pessoais",
  description: "Informações da sua conta.",
};

export const dynamic = "force-dynamic";

export default async function ContaPfPage() {
  const session = await requirePfDashboardSession();

  try {
    const { profile } = await fetchPersonalProfile(session);
    return (
      <section className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-2xl font-extrabold text-[#0f172a]">Dados pessoais</h1>
          <p className="mt-1 text-sm text-[#64748b]">
            Consulte as informações cadastradas e atualize seus dados de contato.
          </p>
        </header>
        <PersonalProfileForm initial={profile} />
      </section>
    );
  } catch {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-extrabold text-[#0f172a]">Dados pessoais</h1>
        <div role="alert" className="rounded-2xl border border-[#F0D3D3] bg-white p-6 text-sm text-[#A13333]">
          Não foi possível carregar seus dados cadastrais agora. Atualize a página ou tente
          novamente mais tarde.
        </div>
      </section>
    );
  }
}
