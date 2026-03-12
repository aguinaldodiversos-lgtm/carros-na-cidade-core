import type { AccountType } from "@/lib/dashboard-types";
import { getUserById } from "@/services/planStore";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  type: AccountType;
  cnpj_verified: boolean;
};

export type AuthSession = {
  user: AuthUser;
  accessToken?: string;
  refreshToken?: string;
};

const localCredentials = [
  {
    user_id: "user-cpf-demo",
    email: "cpf@carrosnacidade.com",
    password: "123456",
  },
  {
    user_id: "user-cnpj-demo",
    email: "lojista@carrosnacidade.com",
    password: "123456",
  },
];

type BackendUserPayload = {
  id?: string | number;
  user_id?: string;
  name?: string;
  email?: string;
  type?: string;
  document_type?: string;
  documentType?: string;
  cnpj_verified?: boolean;
  cnpjVerified?: boolean;
};

type BackendLoginResponse = {
  token?: string;
  access_token?: string;
  accessToken?: string;
  jwt?: string;
  user?: BackendUserPayload;
  data?: {
    token?: string;
    access_token?: string;
    accessToken?: string;
    user?: BackendUserPayload;
  };
};

type BackendMeResponse = {
  success?: boolean;
  user?: BackendUserPayload;
};

function resolveAuthApiBase() {
  return (
    process.env.AUTH_API_BASE_URL ??
    process.env.BACKEND_API_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    ""
  );
}

function resolveAuthEndpoint(baseUrl: string, endpoint: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  if (!base) return "";
  if (base.endsWith("/api")) {
    return `${base}${path.replace(/^\/api/, "")}`;
  }
  return `${base}${path}`;
}

function normalizeAccountType(input: string | undefined): AccountType {
  const value = (input ?? "").toUpperCase();
  return value === "CNPJ" ? "CNPJ" : "CPF";
}

function toAuthUserFromStore(userId: string, emailHint?: string): AuthUser | null {
  const user = getUserById(userId);
  if (!user) return null;

  return {
    id: user.user_id,
    name: user.name,
    email: emailHint ?? `${user.user_id}@carrosnacidade.com`,
    type: user.document_type,
    cnpj_verified: user.cnpj_verified,
  };
}

function toAuthUserFromBackend(payload: BackendUserPayload, fallbackEmail: string): AuthUser | null {
  const possibleId = payload.user_id ?? payload.id;
  const userId = possibleId !== undefined ? String(possibleId) : "";
  if (!userId) return null;

  const accountType = normalizeAccountType(payload.document_type ?? payload.documentType ?? payload.type);
  return {
    id: userId,
    name: payload.name?.trim() || "Usuario",
    email: payload.email?.trim() || fallbackEmail,
    type: accountType,
    cnpj_verified: Boolean(payload.cnpj_verified ?? payload.cnpjVerified),
  };
}

function findLocalCredentialByEmail(email: string) {
  return localCredentials.find((credential) => credential.email.toLowerCase() === email.toLowerCase());
}

export function getLocalEmailByUserId(userId: string) {
  const found = localCredentials.find((credential) => credential.user_id === userId);
  return found?.email ?? `${userId}@carrosnacidade.com`;
}

function extractAccessToken(payload: BackendLoginResponse) {
  return (
    payload.accessToken ??
    payload.access_token ??
    payload.token ??
    payload.jwt ??
    payload.data?.accessToken ??
    payload.data?.access_token ??
    payload.data?.token
  );
}

function extractRefreshToken(payload: BackendLoginResponse) {
  const data = payload.data as { refreshToken?: string; refresh_token?: string } | undefined;
  const root = payload as BackendLoginResponse & { refreshToken?: string; refresh_token?: string };
  return root.refreshToken ?? root.refresh_token ?? data?.refreshToken ?? data?.refresh_token;
}

async function fetchCurrentUserFromBackend(baseUrl: string, accessToken: string, fallbackEmail: string) {
  const endpoint = resolveAuthEndpoint(baseUrl, "/api/auth/me");
  if (!endpoint) return null;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as BackendMeResponse;
    return payload.user ? toAuthUserFromBackend(payload.user, fallbackEmail) : null;
  } catch {
    return null;
  }
}

async function authenticateAgainstBackend(email: string, password: string): Promise<AuthSession | null> {
  const baseUrl = resolveAuthApiBase();
  if (!baseUrl) return null;

  const endpoint = resolveAuthEndpoint(baseUrl, "/api/auth/login");
  if (!endpoint) return null;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as BackendLoginResponse;
    const accessToken = extractAccessToken(payload);
    const refreshToken = extractRefreshToken(payload);
    const backendUser = payload.user ?? payload.data?.user;
    const resolvedUser =
      (backendUser ? toAuthUserFromBackend(backendUser, email) : null) ??
      (accessToken ? await fetchCurrentUserFromBackend(baseUrl, accessToken, email) : null);

    if (!resolvedUser) return null;

    return {
      user: resolvedUser,
      accessToken: accessToken ? String(accessToken) : undefined,
      refreshToken: refreshToken ? String(refreshToken) : undefined,
    };
  } catch {
    return null;
  }
}

function authenticateLocally(email: string, password: string): AuthSession | null {
  const credential = findLocalCredentialByEmail(email);
  if (!credential) return null;
  if (credential.password !== password) return null;
  const user = toAuthUserFromStore(credential.user_id, credential.email);
  return user ? { user } : null;
}

export async function authenticateUser(email: string, password: string): Promise<AuthSession | null> {
  const backendUser = await authenticateAgainstBackend(email, password);
  if (backendUser) return backendUser;
  return authenticateLocally(email, password);
}

export function getAuthUserById(userId: string): AuthUser | null {
  return toAuthUserFromStore(userId, getLocalEmailByUserId(userId));
}

async function postAuthProxy(endpoint: string, payload: Record<string, unknown>) {
  const baseUrl = resolveAuthApiBase();
  if (!baseUrl) return false;
  const url = resolveAuthEndpoint(baseUrl, endpoint);
  if (!url) return false;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function requestPasswordReset(email: string) {
  const proxied = await postAuthProxy("/api/auth/forgot-password", { email });
  if (proxied) return true;
  return Boolean(findLocalCredentialByEmail(email));
}

export async function resetPassword(token: string, password: string) {
  const proxied = await postAuthProxy("/api/auth/reset-password", { token, password });
  if (proxied) return true;
  return Boolean(token && password.length >= 6);
}
