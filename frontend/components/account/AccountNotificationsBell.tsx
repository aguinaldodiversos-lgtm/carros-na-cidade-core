"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchNotifications,
  fetchUnreadCount,
  formatBadgeCount,
  formatRelativeTime,
  isSafeInternalPath,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type UserNotification,
} from "@/lib/notifications/api";

/**
 * Sino de notificações do painel — PF e lojista, o mesmo componente.
 *
 * Substitui o `NotificationBell` estático que existia no `AccountPanelShell`
 * (ícone decorativo, deliberadamente sem badge para não mostrar número falso).
 * Agora o número é real.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * REGRA QUE GOVERNA TODO ESTE ARQUIVO
 * ────────────────────────────────────────────────────────────────────────────
 * O sino NUNCA pode derrubar o painel. Ele é um adorno do topo; `/dashboard` e
 * `/dashboard-loja` precisam renderizar mesmo com a API de notificações fora.
 * Por isso toda chamada é `catch`-ada e o pior caso é o sino ficar sem badge ou
 * mostrar uma linha de erro dentro do próprio dropdown — nunca propagar.
 *
 * Sem polling contínuo: contador ao montar e quando a aba volta ao foco; lista
 * só ao abrir. Um `setInterval` aqui multiplicaria requests por todas as abas
 * abertas do painel, o dia inteiro, para um dado que muda raramente.
 */

type Props = {
  /** Só para rotular o teste/aria em cada painel; o comportamento é idêntico. */
  variant?: "pf" | "lojista";
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

export default function AccountNotificationsBell({ variant = "pf" }: Props) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      setUnreadCount(await fetchUnreadCount());
    } catch {
      // Silencioso de propósito: sem contador o sino continua utilizável, e um
      // alarme no topo do painel por causa disto seria ruído.
      setUnreadCount(0);
    }
  }, []);

  // Contador ao montar + quando a aba recupera o foco. Barato e suficiente.
  useEffect(() => {
    let active = true;

    const run = () => {
      if (active) void refreshCount();
    };

    run();
    window.addEventListener("focus", run);
    return () => {
      active = false;
      window.removeEventListener("focus", run);
    };
  }, [refreshCount]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const page = await fetchNotifications();
      setItems(page.notifications);
    } catch {
      setError(true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      // Lista só quando abre — fechar não precisa buscar nada.
      if (next) void loadList();
      return next;
    });
  }, [loadList]);

  // Fecha ao clicar fora e ao pressionar Escape.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleItemClick = useCallback(
    async (notification: UserNotification) => {
      // Otimista na UI: o usuário vê a mudança na hora. Se o PATCH falhar,
      // recarregamos o contador para voltar ao estado verdadeiro.
      const wasUnread = notification.read_at == null;
      if (wasUnread) {
        setItems((current) =>
          current.map((item) =>
            item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
          )
        );
        setUnreadCount((current) => Math.max(0, current - 1));
      }

      let marked = true;
      try {
        await markNotificationAsRead(notification.id);
      } catch {
        marked = false;
        void refreshCount();
      }

      // Só navega se a marcação deu certo E o caminho é interno. Um destino
      // não reconhecido simplesmente não navega — nunca mandamos o usuário
      // logado para fora do portal a partir de um clique que ele confia.
      if (marked && isSafeInternalPath(notification.action_path)) {
        setOpen(false);
        router.push(notification.action_path);
      }
    },
    [refreshCount, router]
  );

  const handleMarkAll = useCallback(async () => {
    try {
      await markAllNotificationsAsRead();
      setUnreadCount(0);
      setItems((current) =>
        current.map((item) =>
          item.read_at ? item : { ...item, read_at: new Date().toISOString() }
        )
      );
    } catch {
      void refreshCount();
    }
  }, [refreshCount]);

  const hasUnread = unreadCount > 0;
  // O leitor de tela lê isto por extenso; "1 não lidas" soa errado e é o caso
  // mais comum de todos.
  const ariaLabel = hasUnread
    ? `Notificações, ${unreadCount} ${unreadCount === 1 ? "não lida" : "não lidas"}`
    : "Notificações";

  return (
    <div className="relative" ref={containerRef} data-testid={`notifications-bell-${variant}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="account-notifications-bell"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0e62d8]"
      >
        <BellIcon />
        {hasUnread ? (
          <span
            data-testid="account-notifications-badge"
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
          data-testid="account-notifications-panel"
          className="absolute right-0 z-50 mt-2 w-[340px] overflow-hidden rounded-2xl border border-[#e8ecf4] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
        >
          <div className="flex items-center justify-between border-b border-[#eef1f6] px-4 py-3">
            <p className="text-sm font-bold text-[#1d2538]">Notificações</p>
            {hasUnread ? (
              <button
                type="button"
                onClick={handleMarkAll}
                data-testid="account-notifications-mark-all"
                className="text-xs font-bold text-[#0e62d8] hover:underline"
              >
                Marcar todas como lidas
              </button>
            ) : null}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
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
                            <span
                              aria-hidden
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0e62d8]"
                            />
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
                        <span className="line-clamp-2 text-xs text-[#64748b]">
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
