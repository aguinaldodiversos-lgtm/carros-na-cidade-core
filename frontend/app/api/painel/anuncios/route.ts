import { NextRequest, NextResponse } from "next/server";
import { getBackendApiBaseUrl, resolveBackendApiUrl } from "@/lib/env/backend-api";
import type { AccountType } from "@/lib/dashboard-types";
import {
  buildBackendCreateAdPayload,
  extractBackendErrorMessage,
  fetchResolvedCityByIdFromBackend,
  type PublishWizardInput,
} from "@/lib/painel/create-ad-backend";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  AUTH_COOKIE_NAME,
  getSessionCookieOptions,
  getSessionDataFromRequest,
} from "@/services/sessionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function firstText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function toBoolean(value: string) {
  return value === "true" || value === "1" || value === "on";
}

/** Extrai apenas campos usados em POST /api/ads (demais chaves do FormData são ignoradas). */
function parsePublishWizardForm(source: FormData): PublishWizardInput {
  return {
    cityId: firstText(source, "cityId"),
    brand: firstText(source, "brand"),
    model: firstText(source, "model"),
    version: firstText(source, "version"),
    yearModel: firstText(source, "yearModel"),
    mileage: firstText(source, "mileage"),
    price: firstText(source, "price"),
    fipeValue: firstText(source, "fipeValue"),
    city: firstText(source, "city"),
    state: firstText(source, "state"),
    fuel: firstText(source, "fuel"),
    transmission: firstText(source, "transmission"),
    bodyStyle: firstText(source, "bodyStyle"),
    title: firstText(source, "title"),
    description: firstText(source, "description"),
    acceptTerms: toBoolean(firstText(source, "acceptTerms")),
  };
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return { message: "Resposta JSON inválida do backend." };
    }
  }

  const text = await response.text();
  return { message: text || "Resposta sem conteúdo." };
}

export async function POST(request: NextRequest) {
  try {
    if (!getBackendApiBaseUrl()) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "API do backend não configurada (AUTH_API_BASE_URL, BACKEND_API_URL, API_URL ou NEXT_PUBLIC_API_URL).",
        },
        { status: 500 }
      );
    }

    const source = await request.formData();
    const normalized = parsePublishWizardForm(source);

    if (!normalized.acceptTerms) {
      return NextResponse.json(
        {
          ok: false,
          message: "É necessário aceitar os termos para publicar o anúncio.",
        },
        { status: 400 }
      );
    }

    const session = getSessionDataFromRequest(request);
    const ensured = await ensureSessionWithFreshBackendTokens(session);

    if (!ensured.ok || !ensured.session.accessToken) {
      return NextResponse.json(
        {
          ok: false,
          message: "Faça login para publicar o anúncio.",
        },
        { status: 401 }
      );
    }

    const accountType: AccountType = ensured.session.type === "CNPJ" ? "CNPJ" : "CPF";

    const ufForm = normalized.state.trim().toUpperCase().slice(0, 2);
    const parsedCityId = normalized.cityId ? parseInt(normalized.cityId, 10) : NaN;

    if (!Number.isFinite(parsedCityId) || parsedCityId <= 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Selecione uma cidade válida da lista para continuar.",
        },
        { status: 400 }
      );
    }

    const resolved = await fetchResolvedCityByIdFromBackend(
      parsedCityId,
      ufForm.length === 2 ? ufForm : undefined
    );

    if (!resolved) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Cidade não encontrada na base. Volte ao campo Cidade e escolha novamente na lista.",
        },
        { status: 400 }
      );
    }

    const ufResolved = String(resolved.state).trim().toUpperCase().slice(0, 2);
    if (ufForm && ufResolved && ufForm !== ufResolved) {
      return NextResponse.json(
        {
          ok: false,
          message: "A UF informada não corresponde à cidade selecionada.",
        },
        { status: 400 }
      );
    }

    const body = buildBackendCreateAdPayload(normalized, resolved, accountType);
    const url = resolveBackendApiUrl("/api/ads");
    if (!url) {
      return NextResponse.json({ ok: false, message: "URL do backend inválida." }, { status: 500 });
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${ensured.session.accessToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const parsed = await parseResponse(response);

    const setSessionCookie = (res: NextResponse) => {
      if (ensured.newCookie) {
        res.cookies.set(AUTH_COOKIE_NAME, ensured.newCookie, getSessionCookieOptions());
      }
    };

    if (response.ok) {
      const res = NextResponse.json({
        ok: true,
        message: "Anúncio enviado com sucesso.",
        result: parsed,
      });
      setSessionCookie(res);
      return res;
    }

    const message = extractBackendErrorMessage(parsed, response.status);
    const details =
      parsed && typeof parsed === "object" && "details" in parsed
        ? (parsed as { details: unknown }).details
        : undefined;

    const status =
      response.status >= 400 && response.status < 600 ? response.status : 502;

    const res = NextResponse.json(
      {
        ok: false,
        message,
        ...(details !== undefined ? { details } : {}),
      },
      { status }
    );
    setSessionCookie(res);
    return res;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro inesperado ao processar o anúncio.",
      },
      { status: 500 }
    );
  }
}
