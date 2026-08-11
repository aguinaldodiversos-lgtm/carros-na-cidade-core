// Client + tipos da caixa postal interna (lado do usuário logado). Fala com o
// BFF /api/account/notifications/*, que encaminha ao backend com o Bearer do
// próprio usuário.
//
// Espelho de src/modules/notifications/notifications.constants.js — manter os
// valores em sincronia.

export type UserNotification = {
  id: number;
  recipient_user_id: number | string;
  event_type: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  /** Caminho INTERNO validado no backend (allowlist de prefixo). */
  action_path: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type NotificationPage = {
  notifications: UserNotification[];
  next_cursor: string | null;
  limit: number;
};

/**
 * Teto do badge. Acima disso vira "99+": o número exato deixa de informar e
 * passa a só ocupar espaço.
 */
export const NOTIFICATION_BADGE_MAX = 99;

/** Quantas o dropdown carrega de uma vez. */
export const NOTIFICATION_PANEL_LIMIT = 10;

function extractMessage(payload: unknown, fallbackStatus: number | string): string {
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
    if (typeof obj.error === "string" && obj.error.trim()) return obj.error;
  }
  return `Erro ${fallbackStatus}`;
}

async function notificationsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const suffix = path ? `/${path.replace(/^\//, "")}` : "";
  const res = await fetch(`/api/account/notifications${suffix}`, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) throw new Error(extractMessage(json, res.status));
  return json as T;
}

export async function fetchUnreadCount(): Promise<number> {
  const data = await notificationsFetch<{ count?: number }>("unread-count");
  return typeof data.count === "number" ? data.count : 0;
}

export async function fetchNotifications(
  limit = NOTIFICATION_PANEL_LIMIT
): Promise<NotificationPage> {
  const data = await notificationsFetch<Partial<NotificationPage>>(
    `?limit=${encodeURIComponent(String(limit))}`
  );
  return {
    notifications: Array.isArray(data.notifications) ? data.notifications : [],
    next_cursor: typeof data.next_cursor === "string" ? data.next_cursor : null,
    limit: typeof data.limit === "number" ? data.limit : limit,
  };
}

export async function markNotificationAsRead(id: number): Promise<UserNotification | null> {
  const data = await notificationsFetch<{ notification?: UserNotification }>(
    `${encodeURIComponent(String(id))}/read`,
    { method: "PATCH" }
  );
  return data.notification ?? null;
}

export async function markAllNotificationsAsRead(): Promise<number> {
  const data = await notificationsFetch<{ updated?: number }>("read-all", { method: "PATCH" });
  return typeof data.updated === "number" ? data.updated : 0;
}

/** Rótulo do badge: nunca "0" (o componente esconde), e teto em "99+". */
export function formatBadgeCount(count: number): string {
  if (count > NOTIFICATION_BADGE_MAX) return `${NOTIFICATION_BADGE_MAX}+`;
  return String(count);
}

/**
 * Segunda barreira contra open redirect, no cliente.
 *
 * O backend já valida `action_path` na ESCRITA com a mesma allowlist. Esta
 * checagem existe porque o dado pode ter sido gravado antes de uma regra
 * mudar, ou vir de um ambiente cujo backend não é este — e o custo de recusar
 * um caminho estranho é apenas "não navega", enquanto o custo de aceitar é
 * mandar um usuário logado para fora do portal a partir de um clique que ele
 * confia.
 *
 * Deliberadamente NÃO é uma cópia do validador do backend: aqui só decidimos
 * "posso navegar para isto?", com a regra mínima e sem normalização.
 */
export function isSafeInternalPath(path: string | null | undefined): path is string {
  if (typeof path !== "string" || path === "") return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\")) return false;
  if (/%5c/i.test(path)) return false;

  const pathname = path.split(/[?#]/)[0];
  if (pathname.includes("..")) return false;

  return ["/dashboard", "/dashboard-loja"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** "Há 3 min", "Ontem", "10/08" — formatação leve, sem dependência externa. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Agora";
  if (diffMin < 60) return `Há ${diffMin} min`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Há ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return `Há ${diffDays} dias`;

  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
