import { NextRequest, NextResponse } from "next/server";
import { getBackendApiBaseUrl, resolveBackendApiUrl } from "@/lib/env/backend-api";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";
import type { AccountType } from "@/lib/dashboard-types";
import {
  buildBackendCreateAdPayload,
  extractBackendErrorMessage,
  fetchResolvedCityByIdFromBackend,
  type PublishWizardInput,
} from "@/lib/painel/create-ad-backend";
import { saveWizardPhotosToPublic } from "@/lib/painel/save-ad-photos";
import { uploadPublishPhotosToBackendR2 } from "@/lib/painel/upload-ad-images-backend";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import { applySessionCookiesToResponse, getSessionDataFromRequest } from "@/services/sessionService";

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

    if (ensured.session.type === "pending") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Complete seu cadastro com CPF ou CNPJ antes de publicar. Use a etapa inicial em Novo anúncio.",
        },
        { status: 400 }
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

    const cityResult = await fetchResolvedCityByIdFromBackend(
      parsedCityId,
      ufForm.length === 2 ? ufForm : undefined,
      buildBffBackendForwardHeaders(request)
    );

    if (!cityResult.ok) {
      if (cityResult.reason === "rate_limited") {
        return NextResponse.json(
          {
            ok: false,
            message: "Servidor temporariamente sobrecarregado. Aguarde alguns segundos e tente publicar novamente.",
          },
          { status: 429 }
        );
      }
      if (cityResult.reason === "backend_error") {
        return NextResponse.json(
          {
            ok: false,
            message: "Falha ao validar a cidade no servidor. Tente novamente em instantes.",
          },
          { status: 502 }
        );
      }
      return NextResponse.json(
        {
          ok: false,
          message:
            "Cidade não encontrada na base. Volte ao campo Cidade e escolha novamente na lista.",
        },
        { status: 400 }
      );
    }

    const resolved = cityResult.city;

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

    let photoUrls: string[] = [];

    const draftUrlsRaw = firstText(source, "draftPhotoUrls");
    if (draftUrlsRaw) {
      try {
        const parsed = JSON.parse(draftUrlsRaw);
        if (Array.isArray(parsed)) {
          photoUrls = parsed.filter(
            (u: unknown): u is string => typeof u === "string" && u.trim().length > 0
          );
        }
      } catch {
        /* ignore malformed JSON — fall through to file upload */
      }
    }

    if (photoUrls.length === 0) {
      const attemptedPhotos = source
        .getAll("photos")
        .filter((f): f is File => typeof File !== "undefined" && f instanceof File && f.size > 0);

      try {
        photoUrls = await uploadPublishPhotosToBackendR2(source, ensured.session.accessToken);
      } catch (uploadErr) {
        const isProd = process.env.NODE_ENV === "production";
        if (isProd) {
          return NextResponse.json(
            {
              ok: false,
              message:
                uploadErr instanceof Error
                  ? uploadErr.message
                  : "Falha ao enviar fotos para o armazenamento (R2). Verifique a configuração do backend.",
            },
            { status: 502 }
          );
        }
        photoUrls = await saveWizardPhotosToPublic(source);
      }

      if (photoUrls.length === 0 && attemptedPhotos.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            message: "Não foi possível salvar as fotos. Use JPG ou PNG (máx. 6 MB por foto).",
          },
          { status: 400 }
        );
      }
    }

    if (photoUrls.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Adicione pelo menos uma foto do veículo para publicar.",
        },
        { status: 400 }
      );
    }

    const body = buildBackendCreateAdPayload(normalized, resolved, accountType, photoUrls);
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
        ...buildBffBackendForwardHeaders(request),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const parsed = await parseResponse(response);

    const setSessionCookie = (res: NextResponse) => {
      if (ensured.persistCookies) {
        applySessionCookiesToResponse(res, ensured.persistCookies);
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

    const status = response.status >= 400 && response.status < 600 ? response.status : 502;

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
