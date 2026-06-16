// frontend/lib/analytics/session.ts
//
// Session anônima de primeira-parte para o analytics interno (Fase 4.4).
//
// Privacidade: é apenas um UUID aleatório (sem nome/cpf/telefone/e-mail).
// Persiste em cookie first-party (SameSite=Lax) + espelho em localStorage,
// janela deslizante de 30 dias. NÃO é fingerprint nem identificação pessoal.

const SESSION_KEY = "cnc_aid"; // anonymous id
const SESSION_TTL_DAYS = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function genUuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fallthrough */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * Devolve (criando se necessário) o id anônimo da sessão. Renova a janela de
 * 30 dias a cada chamada. "" em ambiente sem document (SSR).
 */
export function getAnalyticsSessionId(): string {
  if (typeof document === "undefined") return "";

  let id = readCookie(SESSION_KEY);
  if (!id) {
    try {
      id = window.localStorage.getItem(SESSION_KEY);
    } catch {
      id = null;
    }
  }

  if (!id || !UUID_RE.test(id)) {
    id = genUuid();
  }

  writeCookie(SESSION_KEY, id, SESSION_TTL_DAYS);
  try {
    window.localStorage.setItem(SESSION_KEY, id);
  } catch {
    /* localStorage indisponível — cookie já cobre */
  }
  return id;
}
