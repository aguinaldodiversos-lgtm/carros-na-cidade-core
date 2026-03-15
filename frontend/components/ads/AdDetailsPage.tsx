"use client";

import type { AdDetails } from "@/lib/ads/get-ad-details";

type Props = {
  ad: AdDetails;
};

export default function AdDetailsPage({ ad }: Props) {
  return (
    <main className="min-h-screen bg-[#F5F7FB] p-8">
      <div className="mx-auto max-w-5xl rounded-3xl border border-[#E5E9F2] bg-white p-8">
        <h1 className="text-3xl font-extrabold text-[#1D2440]">{ad.title}</h1>
        <p className="mt-4 text-lg text-[#6E748A]">
          {ad.city} - {ad.state}
        </p>
        <p className="mt-6 text-2xl font-bold text-[#1F66E5]">
          {new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
            maximumFractionDigits: 0,
          }).format(ad.price || 0)}
        </p>
      </div>
    </main>
  );
}
