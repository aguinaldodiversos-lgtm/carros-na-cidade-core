import { randomUUID } from "node:crypto";
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
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  applySessionCookiesToResponse,
  getSessionDataFromRequest,
} from "@/services/sessionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PREFIX = "[publish-ad-route]";

/**
 * Submit final aceita SOMENTE referências persistentes de fotos enviadas no
 * Step 2 do wizard (`draftPhotoUrls`). Não há mais upload concorrente neste
 * endpoint — antes existia um pipeline de upload aqui (snapshot de
 * `photos[]` + `runWizardPhotoUploadPipeline`) que coexistia com o upload
 * isolado do Step 2 e podia duplicar arquivos em R2 ou deixar fotos órfãs.
 *
 * Fonte única do upload: `POST /api/painel/anuncios/upload-draft-photos`
 * (chamado no Step 2). Submit recebe as URLs canônicas e o backend
 * (`POST /api/ads`) gera a row em `ads` com `images[]` apontando pra elas.
 */

function firstText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function toBoolean(value: string): boolean {
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

function uniqueNonEmptyStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
}

function parseDraftPhotoUrls(raw: string): string[] {
  if (!raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return uniqueNonEmptyStrings(
      parsed.filter((value): value is string => typeof value === "string")
    );
  } catch {
    return [];
  }
}

function isLikelyHttpUrl(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("/api/vehicle-images?")) return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function parseResponse(response: Response): Promise<unknown> {
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
  const requestId = randomUUID();

  try {
    const backendBaseUrl = getBackendApiBaseUrl();
    if (!backendBaseUrl) {
      return NextResponse.json(
        {
          ok: false,
          requestId,
          message:
            "API do backend não configurada. Configure AUTH_API_BASE_URL, BACKEND_API_URL, CNC_API_URL, API_URL ou NEXT_PUBLIC_API_URL.",
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
          requestId,
          message: "É necessário aceitar os termos para publicar o anúncio.",
        },
        { status: 400 }
      );
    }

    const session = getSessionDataFromRequest(request);
    const ensured = await ensureSessionWithFreshBackendTokens(session);

    const withSessionCookies = (response: NextResponse) => {
      if (ensured.ok && ensured.persistCookies) {
        applySessionCookiesToResponse(response, ensured.persistCookies);
      }
      return response;
    };

    const jsonWithSession = (body: Record<string, unknown>, status: number): NextResponse =>
      withSessionCookies(NextResponse.json(body, { status }));

    if (!ensured.ok || !ensured.session.accessToken) {
      return jsonWithSession(
        {
          ok: false,
          requestId,
          message: "Faça login para publicar o anúncio.",
        },
        401
      );
    }

    // Antes havia um short-circuit aqui que bloqueava publicação quando
    // ensured.session.type === "pending", mas esse valor vem do cookie
    // cnc_session — que pode estar stale se o verify-document concluiu e o
    // browser disparou o publish antes de persistir o cookie atualizado.
    // Resultado: usuário já validado via CompleteProfileGate recebia erro
    // "Complete seu cadastro com CPF ou CNPJ" mesmo com CPF verified=true.
    //
    // Correção: se cookie diz "pending", buscamos o tipo real do backend via
    // /api/auth/me antes de decidir. O backend sempre reflete o DB fresco
    // (authMiddleware lê document_type da tabela users em cada request).
    // Se o usuário realmente for pending no DB, o POST /api/ads subsequente
    // falha com a mensagem correta do próprio backend (fonte de verdade),
    // em vez de bloquearmos aqui com informação desatualizada.
    let resolvedSessionType: AccountType = ensured.session.type;
    if (resolvedSessionType === "pending") {
      const meUrl = resolveBackendApiUrl("/api/auth/me");
      if (meUrl) {
        try {
          const meRes = await fetch(meUrl, {
            method: "GET",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${ensured.session.accessToken}`,
            },
            cache: "no-store",
          });
          if (meRes.ok) {
            const meJson = (await meRes.json().catch(() => null)) as {
              user?: { type?: string };
            } | null;
            const freshType = meJson?.user?.type;
            if (freshType === "CPF" || freshType === "CNPJ") {
              resolvedSessionType = freshType;
            }
          }
        } catch {
          // Falha ao consultar /api/auth/me: seguimos adiante e deixamos o
          // backend /api/ads decidir elegibilidade com base no token + DB.
        }
      }
    }

    const accountType: AccountType = resolvedSessionType === "CNPJ" ? "CNPJ" : "CPF";

    const backendHeaders = buildBffBackendForwardHeaders(request);

    const ufForm = normalized.state.trim().toUpperCase().slice(0, 2);
    const parsedCityId = normalized.cityId ? parseInt(normalized.cityId, 10) : NaN;

    if (!Number.isFinite(parsedCityId) || parsedCityId <= 0) {
      return jsonWithSession(
        {
          ok: false,
          requestId,
          message: "Selecione uma cidade válida da lista para continuar.",
        },
        400
      );
    }

    const cityResult = await fetchResolvedCityByIdFromBackend(
      parsedCityId,
      ufForm.length === 2 ? ufForm : undefined,
      backendHeaders
    );

    if (!cityResult.ok) {
      if (cityResult.reason === "rate_limited") {
        return jsonWithSession(
          {
            ok: false,
            requestId,
            message:
              "Servidor temporariamente sobrecarregado. Aguarde alguns segundos e tente publicar novamente.",
          },
          429
        );
      }

      if (cityResult.reason === "backend_error") {
        return jsonWithSession(
          {
            ok: false,
            requestId,
            message: "Falha ao validar a cidade no servidor. Tente novamente em instantes.",
          },
          502
        );
      }

      return jsonWithSession(
        {
          ok: false,
          requestId,
          message:
            "Cidade não encontrada na base. Volte ao campo Cidade e escolha novamente na lista.",
        },
        400
      );
    }

    const resolved = cityResult.city;
    const ufResolved = String(resolved.state).trim().toUpperCase().slice(0, 2);

    if (ufForm && ufResolved && ufForm !== ufResolved) {
      return jsonWithSession(
        {
          ok: false,
          requestId,
          message: "A UF informada não corresponde à cidade selecionada.",
        },
        400
      );
    }

    // Submit final aceita APENAS referências persistentes vindas do upload
    // do Step 2 (`POST /api/painel/anuncios/upload-draft-photos`). Arquivos
    // brutos no FormData (`photos[]`) são ignorados: tinha um segundo
    // pipeline aqui que reconvertia File→snapshot→re-upload em paralelo
    // ao Step 2, criando duplicatas em R2 e fotos órfãs sem vínculo a `ads`.
    const draftUrlsRaw = firstText(source, "draftPhotoUrls");
    const parsedDraftUrls = draftUrlsRaw ? parseDraftPhotoUrls(draftUrlsRaw) : [];
    const photoUrls = parsedDraftUrls.filter(isLikelyHttpUrl);

    if (photoUrls.length === 0) {
      const ignoredPhotoFiles = source
        .getAll("photos")
        .filter(
          (file): file is File =>
            typeof File !== "undefined" && file instanceof File && file.size > 0
        ).length;

      console.warn(`${LOG_PREFIX} submit sem draftPhotoUrls válidas`, {
        requestId,
        rawProvided: Boolean(draftUrlsRaw),
        parsedCount: parsedDraftUrls.length,
        ignoredPhotoFiles,
      });

      return jsonWithSession(
        {
          ok: false,
          requestId,
          message:
            "Não foi possível confirmar as fotos do anúncio. Refaça o envio das fotos no Step 2 e tente publicar novamente.",
        },
        400
      );
    }

    if (parsedDraftUrls.length !== photoUrls.length) {
      console.warn(`${LOG_PREFIX} submit ignorou URLs de foto malformadas`, {
        requestId,
        provided: parsedDraftUrls.length,
        accepted: photoUrls.length,
      });
    }

    const usedDraftPhotoUrls = true;
    console.info(`${LOG_PREFIX} using draftPhotoUrls`, {
      requestId,
      urlCount: photoUrls.length,
    });

    const backendPayload = buildBackendCreateAdPayload(
      normalized,
      resolved,
      accountType,
      photoUrls
    );

    const publishUrl = resolveBackendApiUrl("/api/ads");
    if (!publishUrl) {
      return jsonWithSession(
        {
          ok: false,
          requestId,
          message: "URL do backend inválida para publicação do anúncio.",
        },
        500
      );
    }

    const response = await fetch(publishUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${ensured.session.accessToken}`,
        "X-Request-Id": requestId,
        ...backendHeaders,
      },
      body: JSON.stringify(backendPayload),
      cache: "no-store",
    });

    const parsed = await parseResponse(response);

    if (response.ok) {
      console.info(`${LOG_PREFIX} publish ok`, {
        requestId,
        usedDraftPhotoUrls,
        photoCount: photoUrls.length,
      });

      return jsonWithSession(
        {
          ok: true,
          requestId,
          message: "Anúncio enviado com sucesso.",
          usedDraftPhotoUrls,
          result: parsed,
        },
        200
      );
    }

    const message = extractBackendErrorMessage(parsed, response.status);
    const details =
      parsed && typeof parsed === "object" && "details" in parsed
        ? (parsed as { details: unknown }).details
        : undefined;

    const status = response.status >= 400 && response.status < 600 ? response.status : 502;

    console.error(`${LOG_PREFIX} publish failed`, {
      requestId,
      status,
      usedDraftPhotoUrls,
      photoCount: photoUrls.length,
      publishUrl,
      parsed,
    });

    return jsonWithSession(
      {
        ok: false,
        requestId,
        message,
        ...(details !== undefined ? { details } : {}),
      },
      status
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro inesperado ao processar o anúncio.";

    console.error(`${LOG_PREFIX} unexpected error`, {
      requestId,
      message,
      error,
    });

    return NextResponse.json(
      {
        ok: false,
        requestId,
        message,
      },
      { status: 500 }
    );
  }
}
