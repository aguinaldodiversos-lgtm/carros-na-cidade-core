import Link from "next/link";
import type { ReactNode } from "react";

import {
  IconArrowUpRight,
  IconBook,
  IconCarFront,
  IconClipboardCheck,
  IconCreditCard,
  IconPin,
  IconShield,
  IconTable,
} from "@/components/home/icons";
import { SectionHeader } from "./SectionHeader";

type ContentItem = {
  id: string;
  icon: ReactNode;
  title: string;
  href: string;
};

const ITEMS: ContentItem[] = [
  {
    id: "comprar",
    icon: <IconShield className="h-6 w-6" />,
    title: "Dicas para compra de veículo usado",
    href: "/blog/compra-usado",
  },
  {
    id: "fipe",
    icon: <IconTable className="h-6 w-6" />,
    title: "Tabela FIPE: como usar e negociar melhor",
    href: "/blog/tabela-fipe",
  },
  {
    id: "financing",
    icon: <IconCreditCard className="h-6 w-6" />,
    title: "Financiamento de veículos: como funciona",
    href: "/blog/financiamento",
  },
  {
    id: "checklist",
    icon: <IconClipboardCheck className="h-6 w-6" />,
    title: "Checklist antes de fechar negócio",
    href: "/blog/checklist",
  },
  {
    id: "vender",
    icon: <IconCarFront className="h-6 w-6" />,
    title: "Como vender seu carro de forma rápida",
    href: "/blog/vender-rapido",
  },
  {
    id: "cidade",
    icon: <IconPin className="h-6 w-6" />,
    title: "Dicas para escolher o carro ideal para sua cidade",
    href: "/blog/carro-cidade",
  },
];

export function ContentCardsSection() {
  return (
    <section className="mx-auto w-full max-w-[1240px] px-4 pb-8 pt-6 sm:px-6 sm:pb-14 sm:pt-10 lg:px-8 lg:pb-16 lg:pt-12">
      <SectionHeader
        icon={<IconBook className="h-6 w-6" />}
        title="Conteúdo para comprar e vender com segurança"
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-3 lg:grid-cols-6 lg:gap-4">
        {ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="group flex flex-col justify-between rounded-[12px] border border-[#dbe0ee] bg-[#eef1f9] px-3 py-3.5 transition hover:-translate-y-0.5 hover:bg-[#e0e5f0] hover:shadow-[0_10px_24px_rgba(45,58,156,0.08)] sm:rounded-[14px] sm:px-4 sm:py-5"
          >
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] bg-white/90 text-[#2d3a9c] shadow-[0_3px_8px_rgba(45,58,156,0.1)] sm:h-10 sm:w-10 sm:rounded-[10px]">
              {item.icon}
            </div>
            <h3 className="mt-3 text-[12.5px] font-extrabold leading-snug text-[#1a1f36] sm:mt-5 sm:text-[13.5px]">
              {item.title}
            </h3>
            <span className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold text-[#2d3a9c] sm:mt-3 sm:text-[12.5px]">
              Saiba mais
              <IconArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
