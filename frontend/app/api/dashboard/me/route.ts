import { NextRequest, NextResponse } from "next/server";
import { BackendApiError, fetchDashboard } from "@/lib/account/backend-account";
import { getClientIpFromNextRequest } from "@/lib/http/client-ip";
import {
  ensureSessionWithFreshBackendTokens,
  type EnsureBackendSessionResult,
} from "@/lib/session/ensure-backend-session";
import type { DashboardPayload } from "@/lib/dashboard-types";
import {
  applyPrivateNoStoreHeaders,
  applySessionCookiesToResponse,
  applyUnauthorizedWithSessionCleanup,
  getSessionDataFromRequest,
  type SessionData,
} from "@/services/sessionService";

export const dynamic = "force-dynamic";

type DashboardErrorCode =
  | "missing_session"
  | "backend_unauthorized"
  | "backend_forbidden"
  | "backend_rate_limited"
  | "backend_unavailable"
  | "network_error"
  | "bff_unexpected";

type DashboardErrorBody = {
  ok: false;
  error: {
    code: DashboardErrorCode;
    message: string;
    upstreamStatus?: number;
  };
  message: string;
};

function dashboardErrorResponse(
  status: number,
  code: DashboardErrorCode,
  message: string,
  upstreamStatus?: number
) {
  const body: DashboardErrorBody = {
    ok: false,
    error: {
      code,
      message,
      ...(upstreamStatus ? { upstreamStatus } : {}),
    },
    message,
  };
  return applyPrivateNoStoreHeaders(NextResponse.json(body, { status }));
}

function dashboardUnauthorizedResponse(
  request: NextRequest,
  code: DashboardErrorCode,
  message: string
) {
  return applyPrivateNoStoreHeaders(
    applyUnauthorizedWithSessionCleanup(request, {
      ok: false,
      error: { code, message },
      message,
    })
  );
}

function dashboardSuccessResponse(payload: DashboardPayload, persistCookies?: SessionData) {
  const res = NextResponse.json(payload);
  applyPrivateNoStoreHeaders(res);
  if (persistCookies) {
    applySessionCookiesToResponse(res, persistCookies);
  }
  return res;
}

function isNetworkLikeError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /Tempo limite|Erro ao comunicar|fetch failed|network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(
    error.message
  );
}

function logBackendFailure(error: BackendApiError) {
  if (error.status === 401) {
    console.warn("[GET /api/dashboard/me] backend 401 ao buscar dashboard", {
      upstreamStatus: error.status,
      code: error.code,
    });
    return;
  }
  if (error.status === 403) {
    console.warn("[GET /api/dashboard/me] backend 403 ao buscar dashboard", {
      upstreamStatus: error.status,
      code: error.code,
    });
    return;
  }
  if (error.status === 429) {
    console.warn("[GET /api/dashboard/me] backend 429 (rate limited)", {
      upstreamStatus: error.status,
      code: error.code,
    });
    return;
  }
  if (error.status >= 500) {
    console.error("[GET /api/dashboard/me] backend 5xx ao buscar dashboard", {
      upstreamStatus: error.status,
      code: error.code,
      message: error.message,
    });
    return;
  }
  console.error("[GET /api/dashboard/me] erro HTTP do backend ao buscar dashboard", {
    upstreamStatus: error.status,
    code: error.code,
    message: error.message,
  });
}

function responseFromDashboardFetchError(request: NextRequest, error: unknown) {
  if (error instanceof BackendApiError) {
    logBackendFailure(error);
    if (error.status === 401) {
      return dashboardUnauthorizedResponse(
        request,
        "backend_unauthorized",
        "Sessao do backend invalida. Entre novamente."
      );
    }
    if (error.status === 403) {
      return dashboardErrorResponse(
        403,
        "backend_forbidden",
        "Esta conta nao tem permissao para acessar este painel.",
        403
      );
    }
    if (error.status === 429) {
      // Rate limit do backend: propaga 429 transparente ao client com
      // mensagem clara. Antes caía no fallback 502 "backend_unavailable"
      // mascarando o sintoma e fazendo o recovery client exibir "Codigo 502".
      return dashboardErrorResponse(
        429,
        "backend_rate_limited",
        "Muitas solicitacoes ao painel em curto intervalo. Aguarde alguns minutos e tente novamente.",
        429
      );
    }
    if (error.status >= 500) {
      return dashboardErrorResponse(
        502,
        "backend_unavailable",
        "Backend indisponivel ao carregar o dashboard.",
        error.status
      );
    }
    return dashboardErrorResponse(
      502,
      "backend_unavailable",
      "Resposta inesperada do backend ao carregar o dashboard.",
      error.status
    );
  }

  if (isNetworkLikeError(error)) {
    console.error(
      "[GET /api/dashboard/me] erro de rede ao buscar dashboard",
      error instanceof Error ? error.message : error
    );
    return dashboardErrorResponse(
      502,
      "network_error",
      "Falha de rede ao comunicar com o backend do dashboard."
    );
  }

  console.error(
    "[GET /api/dashboard/me] erro inesperado no BFF",
    error instanceof Error ? error.message : error
  );
  return dashboardErrorResponse(
    502,
    "bff_unexpected",
    "Falha inesperada no BFF ao carregar o dashboard."
  );
}

async function fetchDashboardWithOptionalRefresh(
  request: NextRequest,
  ensured: Extract<EnsureBackendSessionResult, { ok: true }>
) {
  const clientIp = getClientIpFromNextRequest(request) || undefined;
  try {
    const payload = await fetchDashboard(ensured.session, { allowRetry: true, clientIp });
    return dashboardSuccessResponse(payload, ensured.persistCookies);
  } catch (error) {
    if (!(error instanceof BackendApiError) || error.status !== 401) {
      return responseFromDashboardFetchError(request, error);
    }

    if (ensured.persistCookies) {
      console.warn("[GET /api/dashboard/me] backend 401 apos refresh inicial; encerrando com 401");
      return dashboardUnauthorizedResponse(
        request,
        "backend_unauthorized",
        "Sessao do backend invalida. Entre novamente."
      );
    }

    console.warn("[GET /api/dashboard/me] backend 401; tentando refresh controlado uma vez");
    const refreshed = await ensureSessionWithFreshBackendTokens(ensured.session, {
      forceRefresh: true,
    });
    if (!refreshed.ok) {
      console.warn("[GET /api/dashboard/me] refresh falhou apos backend 401", {
        reason: refreshed.reason,
      });
      return dashboardUnauthorizedResponse(
        request,
        "backend_unauthorized",
        "Sessao do backend invalida. Entre novamente."
      );
    }

    try {
      console.info("[GET /api/dashboard/me] refresh bem-sucedido; repetindo dashboard uma vez");
      // Aqui já é a retentativa pós-refresh, sem retry interno adicional.
      const payload = await fetchDashboard(refreshed.session, { clientIp });
      return dashboardSuccessResponse(payload, refreshed.persistCookies);
    } catch (retryError) {
      return responseFromDashboardFetchError(request, retryError);
    }
  }
}

export async function GET(request: NextRequest) {
  const session = getSessionDataFromRequest(request);
  if (!session || (!session.accessToken && !session.refreshToken)) {
    return dashboardUnauthorizedResponse(
      request,
      "missing_session",
      "Sessao ausente. Entre novamente."
    );
  }

  const ensured = await ensureSessionWithFreshBackendTokens(session);
  if (!ensured.ok) {
    console.warn("[GET /api/dashboard/me] sessao sem token backend utilizavel", {
      reason: ensured.reason,
    });
    return dashboardUnauthorizedResponse(
      request,
      "backend_unauthorized",
      "Sessao do backend invalida. Entre novamente."
    );
  }

  return fetchDashboardWithOptionalRefresh(request, ensured);
}
