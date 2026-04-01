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

export type AuthenticatedSession = AuthSession & {
  accessToken: string;
  refreshToken: string;
};

// Credenciais demo APENAS em desenvolvimento local e sem backend configurado.
// Em produção (NODE_ENV=production) esta lista é vazia — o backend real é sempre consultado.
// As senhas foram alteradas para não coincidir com senhas reais de produção.
const LOCAL_DEMO_CREDENTIALS =
  process.env.NODE_ENV !== "production"
    ? [
        {
          user_id: "user-cpf-demo",
          email: "cpf@carrosnacidade.com",
          password: "demo-cpf-local-only",
        },
        {
          user_id: "user-cnpj-demo",
          email: "lojista@carrosnacidade.com",
          password: "demo-cnpj-local-only",
        },
      ]
    : [];

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
  document_verified?: boolean;
  role?: string;
  plan?: string;
};

type BackendAuthResponse = {
  success?: boolean;
  token?: string;
  access_token?: string;
  accessToken?: string;
  jwt?: string;
  refreshToken?: string;
  refresh_token?: string;
  user?: BackendUserPayload;
  error?: string;
  message?: string;
  data?: {
    token?: string;
    access_token?: string;
    accessToken?: string;
    refreshToken?: string;
    refresh_token?: string;
    user?: BackendUserPayload;
  };
};

type BackendMeResponse = {
  success?: boolean;
  user?: BackendUserPayload;
  data?: {
    user?: BackendUserPayload;
  };
};

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  phone?: string;
  city?: string;
  document_type?: "cpf" | "cnpj";
  document_number?: string;
};

export type RegisterResult =
  | { success: true; session: AuthenticatedSession }
  | { success: false; error?: string };

type LoginCompatPayload = {
  email?: string;
  password?: string;
  next?: string;
};

type RegisterCompatPayload = RegisterPayload & {
  next?: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return normalizeString(value).toLowerCase();
}

function onlyDigits(value: unknown) {
  return normalizeString(value).replace(/\D/g, "");
}

function resolveAuthApiBase() {
  return normalizeString(
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
  const value = normalizeString(input).toUpperCase();
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

function toAuthUserFromBackend(
  payload: BackendUserPayload,
  fallbackEmail: string
): AuthUser | null {
  const possibleId = payload.user_id ?? payload.id;
  const userId = possibleId !== undefined ? String(possibleId) : "";

  if (!userId) return null;

  const accountType = normalizeAccountType(
    payload.document_type ?? payload.documentType ?? payload.type
  );

  return {
    id: userId,
    name: normalizeString(payload.name) || "Usuario",
    email: normalizeEmail(payload.email) || normalizeEmail(fallbackEmail),
    type: accountType,
    cnpj_verified:
      accountType === "CNPJ"
        ? Boolean(payload.cnpj_verified ?? payload.cnpjVerified ?? payload.document_verified)
        : false,
  };
}

function findLocalCredentialByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return LOCAL_DEMO_CREDENTIALS.find(
    (credential) => credential.email.toLowerCase() === normalizedEmail
  );
}

export function getLocalEmailByUserId(userId: string) {
  const found = LOCAL_DEMO_CREDENTIALS.find((credential) => credential.user_id === userId);
  return found?.email ?? `${userId}@carrosnacidade.com`;
}

function extractAccessToken(payload: BackendAuthResponse) {
  const token =
    payload.accessToken ??
    payload.access_token ??
    payload.token ??
    payload.jwt ??
    payload.data?.accessToken ??
    payload.data?.access_token ??
    payload.data?.token;

  return token ? String(token) : undefined;
}

function extractRefreshToken(payload: BackendAuthResponse) {
  const token =
    payload.refreshToken ??
    payload.refresh_token ??
    payload.data?.refreshToken ??
    payload.data?.refresh_token;

  return token ? String(token) : undefined;
}

function extractBackendUser(payload: BackendAuthResponse | BackendMeResponse) {
  return payload.user ?? payload.data?.user ?? null;
}

function extractErrorMessage(
  payload: Partial<BackendAuthResponse>,
  fallback: string
) {
  return normalizeString(payload.error) || normalizeString(payload.message) || fallback;
}

async function safeJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

async function fetchCurrentUserFromBackend(
  baseUrl: string,
  accessToken: string,
  fallbackEmail: string
) {
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

    const payload = await safeJson<BackendMeResponse>(response);
    const backendUser = extractBackendUser(payload);

    return backendUser ? toAuthUserFromBackend(backendUser, fallbackEmail) : null;
  } catch {
    return null;
  }
}

async function buildAuthenticatedSessionFromResponse(
  payload: BackendAuthResponse,
  baseUrl: string,
  fallbackEmail: string
): Promise<AuthenticatedSession | null> {
  const accessToken = extractAccessToken(payload);
  const refreshToken = extractRefreshToken(payload);

  if (!accessToken || !refreshToken) {
    return null;
  }

  const backendUser = extractBackendUser(payload);
  const resolvedUser =
    (backendUser ? toAuthUserFromBackend(backendUser, fallbackEmail) : null) ??
    (await fetchCurrentUserFromBackend(baseUrl, accessToken, fallbackEmail));

  if (!resolvedUser) {
    return null;
  }

  return {
    user: resolvedUser,
    accessToken,
    refreshToken,
  };
}

async function authenticateAgainstBackend(
  email: string,
  password: string
): Promise<AuthenticatedSession | null> {
  const normalizedEmail = normalizeEmail(email);
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
      body: JSON.stringify({
        email: normalizedEmail,
        password,
      }),
      cache: "no-store",
    });

    const payload = await safeJson<BackendAuthResponse>(response);

    if (!response.ok) {
      throw new Error(
        extractErrorMessage(payload, "Nao foi possivel autenticar.")
      );
    }

    return buildAuthenticatedSessionFromResponse(payload, baseUrl, normalizedEmail);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Erro de conexao. Tente novamente.");
  }
}

function authenticateLocally(email: string, password: string): AuthSession | null {
  const credential = findLocalCredentialByEmail(email);
  if (!credential) return null;
  if (credential.password !== password) return null;

  const user = toAuthUserFromStore(credential.user_id, credential.email);
  return user ? { user } : null;
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<AuthSession | null> {
  const baseUrl = resolveAuthApiBase();

  if (baseUrl) {
    return authenticateAgainstBackend(email, password);
  }

  return authenticateLocally(email, password);
}

export async function registerUser(
  payload: RegisterPayload
): Promise<RegisterResult> {
  const name = normalizeString(payload.name);
  const email = normalizeEmail(payload.email);
  const password = typeof payload.password === "string" ? payload.password : "";
  const phone = onlyDigits(payload.phone).slice(0, 11);
  const city = normalizeString(payload.city);
  const documentNumber = onlyDigits(payload.document_number);
  const documentType =
    payload.document_type === "cpf" || payload.document_type === "cnpj"
      ? payload.document_type
      : undefined;

  if (!name) {
    return { success: false, error: "Nome é obrigatório." };
  }

  if (!email) {
    return { success: false, error: "Email é obrigatório." };
  }

  if (!password) {
    return { success: false, error: "Senha é obrigatória." };
  }

  if (password.length < 8) {
    return { success: false, error: "Senha deve ter no minimo 8 caracteres." };
  }

  if ((documentType && !documentNumber) || (!documentType && documentNumber)) {
    return {
      success: false,
      error: "Informe tipo e numero do documento juntos.",
    };
  }

  const baseUrl = resolveAuthApiBase();
  if (!baseUrl) {
    return { success: false, error: "API do backend nao configurada." };
  }

  const endpoint = resolveAuthEndpoint(baseUrl, "/api/auth/register");
  if (!endpoint) {
    return { success: false, error: "Endpoint de cadastro nao configurado." };
  }

  try {
    const body: Record<string, unknown> = {
      name,
      email,
      password,
      ...(phone ? { phone } : {}),
      ...(city ? { city } : {}),
      ...(documentType ? { document_type: documentType } : {}),
      ...(documentNumber ? { document_number: documentNumber } : {}),
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await safeJson<BackendAuthResponse>(response);

    if (!response.ok) {
      return {
        success: false,
        error: extractErrorMessage(data, "Nao foi possivel criar a conta."),
      };
    }

    const session = await buildAuthenticatedSessionFromResponse(
      data,
      baseUrl,
      email
    );

    if (!session) {
      return {
        success: false,
        error:
          "Cadastro realizado, mas nao foi possivel iniciar a sessao automaticamente.",
      };
    }

    return {
      success: true,
      session,
    };
  } catch {
    return { success: false, error: "Erro de conexao. Tente novamente." };
  }
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
  const normalizedEmail = normalizeEmail(email);
  const proxied = await postAuthProxy("/api/auth/forgot-password", {
    email: normalizedEmail,
  });

  if (proxied) return true;

  return Boolean(findLocalCredentialByEmail(normalizedEmail));
}

export async function resetPassword(token: string, password: string) {
  const normalizedToken = normalizeString(token);
  const proxied = await postAuthProxy("/api/auth/reset-password", {
    token: normalizedToken,
    password,
  });

  if (proxied) return true;

  return Boolean(normalizedToken && password.length >= 8);
}

async function parseLocalApiResponse(response: Response) {
  const data = await safeJson<Record<string, unknown>>(response);

  if (!response.ok) {
    const errorMessage =
      typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
        ? data.message
        : "Erro na autenticacao.";

    throw new Error(errorMessage);
  }

  return data;
}

export async function login(
  payloadOrEmail: LoginCompatPayload | string,
  maybePassword?: string
) {
  const email =
    typeof payloadOrEmail === "string"
      ? normalizeEmail(payloadOrEmail)
      : normalizeEmail(payloadOrEmail?.email);

  const password =
    typeof payloadOrEmail === "string"
      ? typeof maybePassword === "string"
        ? maybePassword
        : ""
      : typeof payloadOrEmail?.password === "string"
      ? payloadOrEmail.password
      : "";

  const next =
    typeof payloadOrEmail === "string"
      ? ""
      : normalizeString(payloadOrEmail?.next);

  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      email,
      password,
      ...(next ? { next } : {}),
    }),
  });

  return parseLocalApiResponse(response);
}

export async function register(payload: RegisterCompatPayload) {
  const name = normalizeString(payload.name);
  const email = normalizeEmail(payload.email);
  const password = typeof payload.password === "string" ? payload.password : "";
  const phone = onlyDigits(payload.phone).slice(0, 11);
  const city = normalizeString(payload.city);
  const documentNumber = onlyDigits(payload.document_number);
  const next = normalizeString(payload.next);

  const documentType =
    payload.document_type === "cpf" || payload.document_type === "cnpj"
      ? payload.document_type
      : undefined;

  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      name,
      email,
      password,
      ...(phone ? { phone } : {}),
      ...(city ? { city } : {}),
      ...(documentType ? { document_type: documentType } : {}),
      ...(documentNumber ? { document_number: documentNumber } : {}),
      ...(next ? { next } : {}),
    }),
  });

  return parseLocalApiResponse(response);
}

// Aliases mantidos apenas para compatibilidade com código existente.
// Prefira importar `register` diretamente em novos usos.
export const signUp = register;
export const signup = register;
export const createUser = register;
export const createAccount = register;

const authService = {
  login,
  authenticateUser,
  register,
  registerUser,
  signUp,
  signup,
  createUser,
  createAccount,
  requestPasswordReset,
  resetPassword,
  getAuthUserById,
  getLocalEmailByUserId,
};

export default authService;
