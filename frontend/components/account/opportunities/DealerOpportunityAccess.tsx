"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

type Rights = {
  mode: "launch" | "paid";
  buyers: boolean;
  vehicle_evaluation: boolean;
};

async function fetchAccess(): Promise<Rights> {
  const response = await fetch("/api/account/opportunities/access", { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as
    | { success?: boolean; rights?: Rights }
    | null;
  if (!response.ok || body?.success !== true || !body.rights) {
    throw new Error("Não foi possível verificar o acesso.");
  }
  const rights = body.rights;
  if (
    !["launch", "paid"].includes(rights.mode) ||
    typeof rights.buyers !== "boolean" ||
    typeof rights.vehicle_evaluation !== "boolean"
  ) {
    throw new Error("Resposta de permissões inválida.");
  }
  return rights;
}

function LockedOpportunity({
  title,
  plan,
  description,
  testId,
}: {
  title: string;
  plan: "Start" | "Pro";
  description: string;
  testId: string;
}) {
  return (
    <article
      data-testid={testId}
      className="flex min-h-[360px] flex-col justify-between rounded-[22px] border border-[#E1E7F0] bg-gradient-to-br from-[#F7FAFF] to-[#EFF3F9] px-5 py-6 sm:px-7"
    >
      <div>
        <span className="inline-flex rounded-lg bg-white px-3 py-1 text-[11px] font-bold text-[#536885]">
          Exclusivo do plano {plan}
        </span>
        <h2 className="mt-3 text-[22px] font-extrabold text-[#101B3D]">{title}</h2>
        <p className="mt-3 max-w-sm text-[13.5px] leading-relaxed text-[#566786]">
          {description}
        </p>
        <p className="mt-4 text-[12.5px] leading-relaxed text-[#566786]">
          Contrate o plano correspondente para acessar novas oportunidades.
        </p>
      </div>
      <Link
        href="/planos"
        className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#1251C3] px-5 text-[13px] font-bold text-white"
      >
        Conhecer plano {plan} <span className="ml-2" aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

export default function DealerOpportunityAccess({
  launchNotice,
  buyersCard,
  vehiclesCard,
}: {
  launchNotice: ReactNode;
  buyersCard: ReactNode;
  vehiclesCard: ReactNode;
}) {
  const [rights, setRights] = useState<Rights | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setRights(await fetchAccess());
    } catch {
      setRights(null);
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!rights) {
    return error ? (
      <div className="rounded-2xl border border-[#E1E7F0] bg-white p-5 text-sm text-[#536885]">
        Não foi possível verificar suas permissões agora.{" "}
        <button className="font-bold text-[#1251C3] underline" onClick={() => void load()}>
          Tentar novamente
        </button>
      </div>
    ) : (
      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5"
        aria-label="Verificando permissões"
        data-testid="dealer-hub-access-loading"
      >
        {[0, 1].map((id) => (
          <div
            key={id}
            className="min-h-[360px] animate-pulse rounded-[22px] border border-[#E1E7F0] bg-[#F4F7FC]"
          />
        ))}
      </div>
    );
  }

  return (
    <>
      {rights.mode === "launch" ? launchNotice : null}
      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5"
        data-testid="dealer-hub-choices"
      >
        {rights.buyers ? (
          buyersCard
        ) : (
          <LockedOpportunity
            title="Compradores Procurando"
            plan="Pro"
            description="Acesse clientes que procuram veículos e ofereça carros do seu estoque."
            testId="dealer-hub-card-buyers"
          />
        )}
        {rights.vehicle_evaluation ? (
          vehiclesCard
        ) : (
          <LockedOpportunity
            title="Veículos para avaliação"
            plan="Start"
            description="Analise veículos de particulares e envie propostas de compra."
            testId="dealer-hub-card-vehicles"
          />
        )}
      </div>
    </>
  );
}
