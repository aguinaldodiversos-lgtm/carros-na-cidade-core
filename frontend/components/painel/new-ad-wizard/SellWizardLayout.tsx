"use client";

import type { ReactNode } from "react";
import SellWizardProgress from "./SellWizardProgress";

type Props = {
  currentStep: number;
  breadcrumb: ReactNode;
  profileSlot?: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
  messageSlot?: ReactNode;
  footer: ReactNode;
};

/**
 * Layout compartilhado do wizard: fundo, barra de progresso fixa no topo, container central e rodapé de navegação.
 * Cabeçalho/rodapé do site vêm do `app/layout.tsx` (PublicHeader / PublicFooter).
 */
export default function SellWizardLayout({
  currentStep,
  breadcrumb,
  profileSlot,
  title,
  subtitle,
  children,
  messageSlot,
  footer,
}: Props) {
  return (
    <main className="min-h-screen bg-[#F5F7FB]">
      <div className="sticky top-0 z-30 shadow-[0_1px_0_rgba(15,23,42,0.06)]">
        <SellWizardProgress currentStep={currentStep} />
      </div>

      <div className="mx-auto max-w-[820px] px-4 pb-20 pt-6 sm:pt-8">
        {breadcrumb}
        {profileSlot}
        <section className="rounded-[32px] border border-[#E5E9F2] bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-8">
          <h1 className="text-[28px] font-extrabold tracking-[-0.04em] text-[#1D2440] sm:text-[34px]">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-7 text-[#6E748A] sm:text-[15px]">{subtitle}</p>

          <div className="mt-8">{children}</div>

          {messageSlot}

          {footer}
        </section>
      </div>
    </main>
  );
}
