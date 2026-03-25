import { NextRequest, NextResponse } from "next/server";
import { getBackendApiBaseUrl, resolveBackendApiUrl } from "@/lib/env/backend-api";
import {
  buildBackendCreateAdPayload,
  extractBackendErrorMessage,
  type WizardNormalizedFields,
  resolveCityIdFromBackend,
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

function buildNormalizedPayload(source: FormData): WizardNormalizedFields {
  const photos = source
    .getAll("photos")
    .filter((item): item is File => item instanceof File && item.size > 0);

  return {
    sellerType: firstText(source, "sellerType") || "particular",
    brand: firstText(source, "brand"),
    model: firstText(source, "model"),
    version: firstText(source, "version"),
    yearModel: firstText(source, "yearModel"),
    yearManufacture: firstText(source, "yearManufacture"),
    mileage: firstText(source, "mileage"),
    price: firstText(source, "price"),
    fipeValue: firstText(source, "fipeValue"),
    city: firstText(source, "city"),
    state: firstText(source, "state"),
    fuel: firstText(source, "fuel"),
    transmission: firstText(source, "transmission"),
    bodyStyle: firstText(source, "bodyStyle"),
    color: firstText(source, "color"),
    plateFinal: firstText(source, "plateFinal"),
    title: firstText(source, "title"),
    description: firstText(source, "description"),
    whatsapp: firstText(source, "whatsapp"),
    phone: firstText(source, "phone"),
    acceptTerms: toBoolean(firstText(source, "acceptTerms")),
    armored: toBoolean(firstText(source, "armored")),
    optionalFeatures: firstText(source, "optionalFeatures"),
    conditionFlags: firstText(source, "conditionFlags"),
    boostOptionId: firstText(source, "boostOptionId"),
    photoCount: photos.length,
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
    const normalized = buildNormalizedPayload(source);

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

    const cityId = await resolveCityIdFromBackend(normalized.city, normalized.state);
    if (!cityId) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Não encontramos essa cidade na base. Confira o nome da cidade e a UF (ex.: São Paulo / SP).",
        },
        { status: 400 }
      );
    }

    const body = buildBackendCreateAdPayload(normalized, cityId);
    const url = resolveBackendApiUrl("/api/ads");
    if (!url) {
      return NextResponse.json(
        { ok: false, message: "URL do backend inválida." },
        { status: 500 }
      );
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
