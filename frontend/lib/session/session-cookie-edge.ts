/**
 * Assinatura/verificação do cookie de sessão compatível com Edge (Web Crypto),
 * espelhando `services/sessionService.ts` (HMAC-SHA256 + base64url).
 */
import type { AccountType } from "@/lib/dashboard-types";

type EdgeSessionData = {
  id: string;
  name: string;
  email: string;
  type: AccountType;
  accessToken?: string;
  refreshToken?: string;
};

const DEFAULT_DURATION_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = EdgeSessionData & {
  iat: number;
  exp: number;
  /** Legado: tokens no JSON (alinhado a `sessionService.ts`). */
  accessToken?: string;
  refreshToken?: string;
};

const encoder = new TextEncoder();

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET ?? "cnc-dev-session-secret";
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeBase64Url(value: string): string {
  return uint8ArrayToBase64Url(encoder.encode(value));
}

function decodeBase64UrlToString(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function signTokenBody(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return uint8ArrayToBase64Url(new Uint8Array(sig));
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const ea = encoder.encode(a);
  const eb = encoder.encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i]! ^ eb[i]!;
  return diff === 0;
}

export async function verifySessionCookieEdge(tokenValue: string): Promise<EdgeSessionData | null> {
  if (!tokenValue) return null;

  const [body, signature] = tokenValue.split(".");
  if (!body || !signature) return null;

  const expected = await signTokenBody(body);
  if (!timingSafeEqualStrings(expected, signature)) return null;

  try {
    const decoded = decodeBase64UrlToString(body);
    const payload = JSON.parse(decoded) as SessionPayload;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!payload.id || !payload.name || !payload.email || !payload.type) return null;

    return {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      type: payload.type as AccountType,
      ...(payload.accessToken ? { accessToken: payload.accessToken } : {}),
      ...(payload.refreshToken ? { refreshToken: payload.refreshToken } : {}),
    };
  } catch {
    return null;
  }
}

export async function createSessionTokenEdge(
  user: EdgeSessionData,
  maxAgeSeconds = DEFAULT_DURATION_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    type: user.type,
    iat: now,
    exp: now + maxAgeSeconds,
  };
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = await signTokenBody(body);
  return `${body}.${signature}`;
}
