"use client";

import { useCallback, useRef } from "react";
import { useAccountNotifications } from "@/components/account/AccountNotificationsProvider";
import { formatBadgeCount, formatRelativeTime } from "@/lib/notifications/api";

/**
 * Sino de notificações — PF e lojista, mesma implementação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTE COMPONENTE NÃO TEM ESTADO PRÓPRIO (Fase 1.1)
 * ────────────────────────────────────────────────────────────────────────────
 * Contador, lista e ações vivem em `AccountNotificationsProvider`, montado uma
 * vez por painel. O shell renderiza DOIS sinos — um na barra mobile, um na
 * topbar desktop — e o CSS mostra só um. Se cada um tivesse estado próprio,
 * seriam dois `fetchUnreadCount()` por carga e dois listeners de `focus`, já
 * que as duas regiões ficam sempre montadas no DOM.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POSICIONAMENTO DO PAINEL
 * ────────────────────────────────────────────────────────────────────────────
 * No desktop o sino é o penúltimo item de uma topbar alinhada à direita, então
 * `absolute right-0` cai dentro da tela naturalmente.
 *
 * No mobile não: o sino fica no MEIO da barra (à esquerda do menu de usuário e
 * do CTA "Novo anúncio"). Ancorar o painel na borda direita do BOTÃO jogaria
 * 340px para a esquerda a partir de ~200px — ou seja, para fora da tela. E
 * como o `globals.css` tem `body { overflow-x: hidden }`, o vazamento seria
 * CORTADO em silêncio, sem barra de rolagem para denunciar.
 *
 * (Não é hipótese: o `AccountUserMenu`, que já vive nessa barra com
 * `absolute right-0 w-60`, hoje renderiza a `left: -43px` a 360px. Bug
 * pré-existente, fora do escopo desta fase, mas foi o que confirmou o
 * diagnóstico.)
 *
 * A correção é puramente CSS e sem número mágico: no mobile o wrapper é
 * `static`, então o painel se ancora na LINHA da barra (que o shell marca como
 * `relative`) e usa `inset-x-4` — a mesma margem do padding da barra. Em `lg`
 * o wrapper volta a ser `relative` e tudo se comporta exatamente como antes.
 * Nada de `position: fixed` nem de `top` calculado à mão.
 */

type Props = {
  /** Rotula a instância (pf | lojista) e a região (mobile | desktop) nos testes. */
  variant?: "pf" | "lojista";
  placement?: "mobile" | "desktop";
};

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z" />
      <path d="M10.5 21a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

export default function AccountNotificationsBell({ variant = "pf", placement = "desktop" }: Props) {
  const { unreadCount, items, loading, error, open, toggle, handleItemClick, markAll } =
    useAccountNotifications();

  const panelRef = useRef<HTMLDivElement | null>(null);

  /**
   * "Marcar todas" desmonta a si mesmo: ao zerar o contador, `hasUnread` vira
   * false e o botão some — enquanto ele detém o foco. Sem isto o foco cai no
   * `<body>`, e num leitor de tela o cursor virtual sai do dropdown e volta ao
   * começo do documento. Devolvemos o foco ao painel para que a pessoa continue
   * exatamente onde estava.
   */
  const handleMarkAll = useCallback(async () => {
    await markAll();
    panelRef.current?.focus();
  }, [markAll]);

  const hasUnread = unreadCount > 0;
  // O leitor de tela lê isto por extenso; "1 não lidas" soa errado e é o caso
  // mais comum de todos.
  const ariaLabel = hasUnread
    ? `Notificações, ${unreadCount} ${unreadCount === 1 ? "não lida" : "não lidas"}`
    : "Notificações";

  return (
    <div
      className="static lg:relative"
      // Marca de PERTENCIMENTO ao domínio de notificações. O provider usa isto
      // para decidir o que é "clique fora": com dois sinos montados, um clique
      // no painel do sino visível é "fora" do sino oculto — sem esta marca, o
      // oculto fechava o painel antes do clique registrar.
      data-notifications-root
      data-testid={`notifications-bell-${variant}`}
      data-placement={placement}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="account-notifications-bell"
        // 36px no mobile (mesma altura do avatar do menu de usuário, que é o
        // vizinho imediato na barra) e 40px no desktop — o tamanho que a
        // topbar já usava. A barra mobile a 360px tem folga medida de 45px;
        // 36 + gap 8 = 44 entra sem espremer o CTA.
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0e62d8] lg:h-10 lg:w-10"
      >
        <BellIcon />
        {hasUnread ? (
          <span
            data-testid="account-notifications-badge"
            // `absolute` de propósito: o badge não entra no cálculo de largura
            // da barra, então "99+" não empurra o CTA.
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#dc2626] px-1 text-[10px] font-bold leading-[18px] text-white"
          >
            {formatBadgeCount(unreadCount)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notificações"
          ref={panelRef}
          // Focável por código (não pela tecla Tab) para receber o foco quando
          // o botão "Marcar todas" desaparece — ver `handleMarkAll`.
          tabIndex={-1}
          data-testid="account-notifications-panel"
          // Três faixas, e cada uma existe por um motivo medido:
          //
          //   < sm   `inset-x-4`: ocupa a largura útil da barra. A 360px um
          //          painel de largura fixa não caberia sem vazar.
          //   sm–lg  largura contida, colada à direita da barra. Sem isto, a
          //          360px resolvido vira 721px num tablet de 768 — não vaza,
          //          mas é um dropdown absurdo para duas linhas de texto.
          //   lg+    exatamente o que a Fase 1 já fazia (o wrapper volta a ser
          //          `relative`, então `right-0` é a borda do próprio botão).
          className="absolute inset-x-4 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-[#e8ecf4] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.12)] sm:left-auto sm:right-4 sm:w-[360px] lg:inset-x-auto lg:right-0 lg:top-auto lg:w-[340px]"
        >
          <div className="flex items-center justify-between border-b border-[#eef1f6] px-4 py-3">
            <p className="text-sm font-bold text-[#1d2538]">Notificações</p>
            {hasUnread ? (
              <button
                type="button"
                onClick={handleMarkAll}
                data-testid="account-notifications-mark-all"
                // `-mr-2 px-2 py-1.5` amplia a área de toque sem deslocar o
                // texto: com `text-xs` puro o alvo ficava alto demais para o dedo.
                className="-mr-2 rounded-lg px-2 py-1.5 text-xs font-bold text-[#0e62d8] transition hover:bg-[#f0f6ff] hover:underline"
              >
                Marcar todas como lidas
              </button>
            ) : null}
          </div>

          {/* Altura relativa à tela no mobile — um teto fixo de 360px estoura
              em landscape, quando 360x640 vira 640x360.
              `max-lg:landscape:` é o ajuste fino: o painel começa ~133px abaixo
              do topo (cabeçalho do site + barra), então 55vh de 360 ainda
              passaria da dobra. Medido: com 40vh o painel inteiro cabe.
              Escopado a `max-lg` porque desktop também é "landscape" — lá vale
              o teto fixo de sempre. */}
          <div className="max-h-[55vh] overflow-y-auto max-lg:landscape:max-h-[40vh] lg:max-h-[360px]">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-[#94a3b8]">Carregando…</p>
            ) : error ? (
              <p className="px-4 py-6 text-center text-sm text-[#94a3b8]">
                Não foi possível carregar as notificações.
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[#94a3b8]">
                Você ainda não tem notificações.
              </p>
            ) : (
              <ul>
                {items.map((notification) => {
                  const unread = notification.read_at == null;
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => void handleItemClick(notification)}
                        data-testid="account-notification-item"
                        data-unread={unread ? "true" : "false"}
                        className={`flex w-full flex-col items-start gap-0.5 border-b border-[#f1f5f9] px-4 py-3 text-left transition hover:bg-[#f8fafc] ${
                          unread ? "bg-[#f5f9ff]" : "bg-white"
                        }`}
                      >
                        <span className="flex w-full items-center gap-2">
                          {unread ? (
                            <>
                              <span
                                aria-hidden
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0e62d8]"
                              />
                              {/* O ponto azul é decorativo (`aria-hidden`), e o
                                  resto da diferença entre lida e não lida é só
                                  peso e cor. Sem este texto, os dois estados têm
                                  o MESMO nome acessível — quem usa leitor de
                                  tela não consegue distinguir. */}
                              <span className="sr-only">Não lida.</span>
                            </>
                          ) : null}
                          {/* Texto puro: React escapa por padrão. Nunca
                              dangerouslySetInnerHTML — title/body vêm do banco. */}
                          <span
                            className={`min-w-0 flex-1 truncate text-sm ${
                              unread ? "font-bold text-[#1d2538]" : "font-semibold text-[#475569]"
                            }`}
                          >
                            {notification.title}
                          </span>
                        </span>
                        {/* `break-words` impede que uma palavra longa sem espaço
                            (URL, id) estoure a largura em telas estreitas. */}
                        <span className="line-clamp-2 break-words text-xs text-[#64748b]">
                          {notification.body}
                        </span>
                        <span className="text-[11px] text-[#94a3b8]">
                          {formatRelativeTime(notification.created_at)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
