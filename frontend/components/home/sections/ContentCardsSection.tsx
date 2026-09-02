// frontend/components/home/sections/ContentCardsSection.tsx

import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/Card";
import { SectionHeader as DSSectionHeader } from "@/components/ui/SectionHeader";
import type { BlogCategoryId } from "@/lib/blog/blog-page";
import type { HomeContentCard } from "@/lib/home/home-content-cards";
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

/**
 * Ícone por categoria do CMS.
 *
 * Os seis ícones já existiam, presos a seis artigos hardcoded. Agora são
 * escolhidos pela CATEGORIA do post real; categoria ausente ou desconhecida cai
 * no ícone genérico de conteúdo.
 */
function iconForCategory(categoryId: BlogCategoryId | null): ReactNode {
  switch (categoryId) {
    case "compra":
      return <IconShield className="h-5 w-5" />;
    case "venda":
      return <IconCarFront className="h-5 w-5" />;
    case "manutencao":
      return <IconClipboardCheck className="h-5 w-5" />;
    case "financiamento":
      return <IconCreditCard className="h-5 w-5" />;
    case "cidades":
      return <IconPin className="h-5 w-5" />;
    case "mercado":
      return <IconTable className="h-5 w-5" />;
    default:
      return <IconBook className="h-5 w-5" />;
  }
}

/**
 * `cards` vem do servidor (`app/page.tsx` → `buildHomeContentCards`), montado
 * dos posts publicados do CMS. SEM posts, a seção inteira some: um grid vazio
 * com cabeçalho promete conteúdo que não existe — e o estado anterior (seis
 * links 404) era pior ainda.
 */
export function ContentCardsSection({ cards }: { cards: HomeContentCard[] }) {
  if (!cards.length) return null;

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
        {cards.map((item) => (
          <Link key={item.id} href={item.href} className="group flex h-full">
            <Card
              variant="flat"
              padding="md"
              className="flex h-full flex-col bg-cnc-bg transition group-hover:-translate-y-0.5 group-hover:shadow-card"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-cnc-surface text-primary shadow-card sm:h-10 sm:w-10">
                {iconForCategory(item.categoryId)}
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
