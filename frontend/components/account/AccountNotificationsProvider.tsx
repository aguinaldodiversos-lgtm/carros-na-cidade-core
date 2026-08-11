"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  fetchNotifications,
  fetchUnreadCount,
  isSafeInternalPath,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type UserNotification,
} from "@/lib/notifications/api";

/**
 * Estado das notificações, montado UMA única vez por painel.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO EXISTE (Fase 1.1)
 * ────────────────────────────────────────────────────────────────────────────
 * O shell tem duas regiões mutuamente exclusivas: a barra mobile (`lg:hidden`)
 * e a topbar desktop (`hidden lg:flex`). Elas são alternadas por CSS, não por
 * renderização condicional — as duas ficam SEMPRE montadas no DOM, e o
 * navegador só esconde uma.
 *
 * Consequência medida: na Fase 1 o sino vivia só na topbar desktop e, a 360px,
 * continuava montado e buscando `unread-count` — invisível, mas custando a
 * request. E a correção ingênua (colocar um segundo `<AccountNotificationsBell/>`
 * na barra mobile) dobraria isso: dois componentes montados, dois
 * `fetchUnreadCount()` por carga e dois listeners de `focus`.
 *
 * Aqui o estado sai do componente e sobe para um provider montado uma vez. Os
 * dois sinos viram casca visual: consomem o mesmo contador, a mesma lista e as
 * mesmas ações. Dois botões no DOM, UMA busca.
 *
 * Não é `useMediaQuery`/render condicional de propósito: isso traria mismatch
 * de hidratação e um flash do sino na primeira pintura. CSS decide o que
 * aparece; o React decide o que busca.
 */

type NotificationsContextValue = {
  unreadCount: number;
  items: UserNotification[];
  loading: boolean;
  error: boolean;
  /** Painel aberto — compartilhado, mas só um dos dois sinos está visível. */
  open: boolean;
  toggle: () => void;
  close: () => void;
  handleItemClick: (notification: UserNotification) => Promise<void>;
  markAll: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useAccountNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error(
      "useAccountNotifications precisa estar dentro de <AccountNotificationsProvider>."
    );
  }
  return ctx;
}

export function AccountNotificationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      setUnreadCount(await fetchUnreadCount());
    } catch {
      // Silencioso: sem contador o sino continua utilizável, e um alarme no
      // topo do painel por causa disto seria ruído.
      setUnreadCount(0);
    }
  }, []);

  // UMA busca ao montar + UM listener de foco, para o painel inteiro.
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

  const close = useCallback(() => setOpen(false), []);

  /**
   * Fechar ao tocar fora / Escape — no PROVIDER, não em cada sino.
   *
   * Isto começou como bug real, pego pelo teste de dois sinos montados: com o
   * listener dentro do componente, cada sino considerava "fora" tudo que não
   * estivesse dentro de si mesmo. Como o painel aberto pertence ao sino
   * VISÍVEL, qualquer clique nele era "fora" para o sino OCULTO — que fechava
   * o painel no `pointerdown`, removendo o botão do DOM antes do `click`
   * disparar. Na prática: "Marcar todas" e cada notificação ficavam
   * inclicáveis assim que existiu um segundo sino.
   *
   * Aqui o teste é por PERTENCIMENTO AO DOMÍNIO (`data-notifications-root`),
   * não por proximidade de um nó específico: clique dentro de QUALQUER sino ou
   * painel de notificação não fecha. E é um listener só, não um por sino.
   *
   * `pointerdown` e não `mousedown`: cobre mouse, toque e caneta de uma vez.
   * Navegadores mobile até emitem `mousedown` sintético depois do toque, mas
   * com atraso e sujeito a cancelamento — `pointerdown` é o que o dedo produz.
   */
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.("[data-notifications-root]")) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleItemClick = useCallback(
    async (notification: UserNotification) => {
      // Otimista: o usuário vê a mudança na hora. Se o PATCH falhar,
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

      // Só navega se a marcação deu certo E o caminho é interno. Destino não
      // reconhecido simplesmente não navega — nunca mandamos o usuário logado
      // para fora do portal a partir de um clique em que ele confia.
      if (marked && isSafeInternalPath(notification.action_path)) {
        setOpen(false);
        router.push(notification.action_path);
      }
    },
    [refreshCount, router]
  );

  const markAll = useCallback(async () => {
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

  const value = useMemo(
    () => ({ unreadCount, items, loading, error, open, toggle, close, handleItemClick, markAll }),
    [unreadCount, items, loading, error, open, toggle, close, handleItemClick, markAll]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
