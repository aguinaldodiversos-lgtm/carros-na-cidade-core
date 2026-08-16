"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { label: "Dashboard", href: "/admin" },
  { label: "Moderação", href: "/admin/moderation" },
  { label: "Denúncias", href: "/admin/denuncias" },
  { label: "Anúncios", href: "/admin/anuncios" },
  // Identidade antes de operação: Usuários = todas as contas; Anunciantes = o
  // subconjunto que já publicou e tem loja.
  { label: "Usuários", href: "/admin/usuarios" },
  { label: "Anunciantes", href: "/admin/anunciantes" },
  { label: "Comercial", href: "/admin/comercial" },
  { label: "SEO", href: "/admin/seo" },
  { label: "Conteúdo", href: "/admin/conteudo/home" },
  { label: "Blog", href: "/admin/conteudo/blog" },
  { label: "Chamados", href: "/admin/chamados" },
  { label: "Pagamentos", href: "/admin/pagamentos" },
  { label: "Métricas", href: "/admin/metricas" },
  { label: "Analytics", href: "/admin/analytics" },
  { label: "Configurações", href: "/admin/configuracoes" },
] as const;

export function AdminTopbar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  return (
    // `overflow-hidden` no header impede que o nav, ao rolar, arraste o BODY
    // junto: o scroll fica contido na faixa azul.
    <header className="sticky top-0 z-50 w-full overflow-hidden bg-[#1a56db] shadow-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-5 sm:gap-6">
        {/*
          Em 360px o wordmark consome ~120px e deixava a faixa do nav com 148px
          — rolável, mas mostrando um item e meio de cada vez. Abaixo de `sm` só
          o ícone fica (que continua sendo o link para /admin), devolvendo esse
          espaço à navegação. Nenhuma informação se perde: o admin sabe em que
          produto está.
        */}
        <Link href="/admin" className="flex items-center gap-2 shrink-0 mr-0 sm:mr-4">
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="currentColor">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
          </svg>
          <span className="hidden text-[15px] font-bold text-white tracking-tight sm:inline">
            Carros na Cidade
          </span>
        </Link>

        {/*
          15 itens não cabem em 360px — e antes da Admin U1 este nav era um
          `flex` sem wrap, sem overflow e sem shrink: itens flex têm
          `min-width: auto`, logo não encolhem abaixo do texto e estouravam o
          container, dando scroll horizontal na PÁGINA inteira no celular.

          A correção é mínima e local: o nav vira a única região rolável
          (`overflow-x-auto`), cada item recusa encolher (`shrink-0`) para o
          rótulo não quebrar em duas linhas, e `min-w-0` permite que o flex
          item encolha até caber — sem ele o `overflow-x-auto` nunca ativaria.
          Nada de sidebar ou hambúrguer: seria redesenhar o admin.

          `scrollbar-width: none` esconde a barra sem desabilitar o gesto de
          rolagem (touch e trackpad continuam funcionando).
        */}
        <nav
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Navegação administrativa"
        >
          {NAV.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              // px-2.5 (e não px-3) porque com o 15º item os rótulos somam
              // 1203px numa faixa de 1149px em 1440 — o último ficaria cortado
              // no desktop. Com 10px de padding e gap-0.5 são 1115px, 34px de
              // folga, sem mudar a aparência de forma perceptível.
              className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
                isActive(href)
                  ? "bg-white/20 text-white"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-[13px] font-medium text-white/80 sm:inline">Admin</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
            A
          </div>
        </div>
      </div>
    </header>
  );
}
