// Client + tipos dos chamados de suporte (lado do usuário logado). Fala com o
// BFF /api/support/* (que encaminha para o backend com o Bearer do usuário).
//
// Espelho das constantes do backend (src/modules/support/support.constants.js)
// e dos limites de validação — mantenha em sincronia.

export type SupportTicketStatus = "aberto" | "em_andamento" | "resolvido";
export type SupportAuthorRole = "user" | "admin";

export type SupportTicket = {
  id: number;
  user_id: number;
  subject: string;
  category: string | null;
  status: SupportTicketStatus;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

export type SupportMessage = {
  id: number;
  ticket_id: number;
  author_id: number | null;
  author_role: SupportAuthorRole;
  body: string;
  created_at: string;
};

export const SUPPORT_STATUS_LABEL: Record<SupportTicketStatus, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
};

export const SUPPORT_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "conta", label: "Conta" },
  { value: "plano", label: "Plano" },
  { value: "anuncios", label: "Anúncios" },
  { value: "pagamento", label: "Pagamento" },
  { value: "outro", label: "Outro" },
];

export const SUPPORT_LIMITS = {
  SUBJECT_MIN: 3,
  SUBJECT_MAX: 120,
  BODY_MIN: 1,
  BODY_MAX: 5000,
} as const;

function extractMessage(payload: unknown, fallbackStatus: number | string): string {
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
    if (typeof obj.error === "string" && obj.error.trim()) return obj.error;
  }
  return `Erro ${fallbackStatus}`;
}

async function supportFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/support/${path.replace(/^\//, "")}`, {
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

export function listMyTickets() {
  return supportFetch<{ success: boolean; tickets: SupportTicket[] }>("tickets");
}

export function getMyTicket(id: number | string) {
  return supportFetch<{ success: boolean; ticket: SupportTicket; messages: SupportMessage[] }>(
    `tickets/${id}`
  );
}

export function createTicket(input: { subject: string; category?: string; body: string }) {
  return supportFetch<{ success: boolean; ticket: SupportTicket; messages: SupportMessage[] }>(
    "tickets",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function replyToMyTicket(id: number | string, body: string) {
  return supportFetch<{ success: boolean; ticket: SupportTicket; message: SupportMessage }>(
    `tickets/${id}/messages`,
    { method: "POST", body: JSON.stringify({ body }) }
  );
}
