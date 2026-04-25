// frontend/components/home/sections/ContentCardsSection.tsx

import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/Card";
import { SectionHeader as DSSectionHeader } from "@/components/ui/SectionHeader";
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

/**
 * PR G — ContentCardsSection refatorado.
 *
 * Integração de blog como motor de aquisição: header com link
 * "Ver todos" para /blog, grid de 6 atalhos para artigos
 * categorizados. Reusa primitivos do DS (SectionHeader, Card)
 * em vez de classes ad-hoc com hex hardcoded.
 *
 * O blog aparece UMA vez (este componente) + atalho circular em
 * HomeShortcuts. Mantemos as duas entradas porque cada uma cumpre
 * função distinta (atalho rápido vs. seção curada de artigos).
 *
 * Server Component.
 */

type ContentItem = {
  id: string;
  icon: ReactNode;
  title: string;
  href: string;
};

const ITEMS: ContentItem[] = [
  {
    id: "comprar",
    icon: <IconShield className="h-5 w-5" />,
    title: "Dicas para compra de veículo usado",
    href: "/blog/compra-usado",
  },
  {
    id: "fipe",
    icon: <IconTable className="h-5 w-5" />,
    title: "Tabela FIPE: como usar e negociar melhor",
    href: "/blog/tabela-fipe",
  },
  {
    id: "financing",
    icon: <IconCreditCard className="h-5 w-5" />,
    title: "Financiamento de veículos: como funciona",
    href: "/blog/financiamento",
  },
  {
    id: "checklist",
    icon: <IconClipboardCheck className="h-5 w-5" />,
    title: "Checklist antes de fechar negócio",
    href: "/blog/checklist",
  },
  {
    id: "vender",
    icon: <IconCarFront className="h-5 w-5" />,
    title: "Como vender seu carro de forma rápida",
    href: "/blog/vender-rapido",
  },
  {
    id: "cidade",
    icon: <IconPin className="h-5 w-5" />,
    title: "Dicas para escolher o carro ideal para sua cidade",
    href: "/blog/carro-cidade",
  },
];

export function ContentCardsSection() {
  return (
    <section className="mx-auto w-full max-w-8xl px-4 pb-8 pt-6 sm:px-6 sm:pb-14 sm:pt-10 lg:px-8 lg:pb-16 lg:pt-12">
      <DSSectionHeader
        as="h2"
        title="Conteúdo para comprar e vender com segurança"
        variant="with-icon"
        icon={<IconBook className="h-5 w-5" />}
        seeAllHref="/blog"
        seeAllLabel="Ver todos"
        className="mb-4 sm:mb-6"
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6 lg:gap-4">
        {ITEMS.map((item) => (
          <Link key={item.id} href={item.href} className="group flex h-full">
            <Card
              variant="flat"
              padding="md"
              className="flex h-full flex-col bg-cnc-bg transition group-hover:-translate-y-0.5 group-hover:shadow-card"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-cnc-surface text-primary shadow-card sm:h-10 sm:w-10">
                {item.icon}
              </span>
              <h3 className="mt-3 text-xs font-bold leading-snug text-cnc-text-strong sm:mt-4 sm:text-sm">
                {item.title}
              </h3>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary sm:mt-3">
                Saiba mais
                <IconArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
