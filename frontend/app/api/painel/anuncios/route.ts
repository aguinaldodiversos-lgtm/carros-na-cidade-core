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
import { snapshotPhotoFiles } from "@/lib/painel/upload-draft-photo-snapshots";
import {
  runWizardPhotoUploadPipeline,
  type WizardPipelineError,
} from "@/lib/painel/upload-wizard-photos-pipeline";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  applySessionCookiesToResponse,
  getSessionDataFromRequest,
} from "@/services/sessionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PREFIX = "[publish-ad-route]";
const MAX_WIZARD_FILES = 10;

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

function toSafeHttpStatus(input?: number): number {
  const allowed = new Set([400, 401, 403, 408, 409, 413, 415, 422, 429, 500, 502, 503, 504]);
  if (!input || !allowed.has(input)) return 502;
  return input;
}

function sanitizePipelineError(error: WizardPipelineError): Record<string, unknown> {
  return {
    stage: error.stage,
    message: error.message,
    statusCode: error.statusCode,
    code: error.code,
    requestId: error.requestId,
    backendUrl: error.backendUrl,
  };
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

    if (ensured.session.type === "pending") {
      return jsonWithSession(
        {
          ok: false,
          requestId,
          message:
            "Complete seu cadastro com CPF ou CNPJ antes de publicar. Use a etapa inicial em Novo anúncio.",
        },
        400
      );
    }

    const accountType: AccountType = ensured.session.type === "CNPJ" ? "CNPJ" : "CPF";

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

    let photoUrls: string[] = [];
    let usedDraftPhotoUrls = false;

    const draftUrlsRaw = firstText(source, "draftPhotoUrls");
    if (draftUrlsRaw) {
      photoUrls = parseDraftPhotoUrls(draftUrlsRaw);
      usedDraftPhotoUrls = photoUrls.length > 0;

      if (usedDraftPhotoUrls) {
        console.info(`${LOG_PREFIX} using draftPhotoUrls`, {
          requestId,
          urlCount: photoUrls.length,
        });
      } else {
        console.warn(`${LOG_PREFIX} invalid or empty draftPhotoUrls`, {
          requestId,
        });
      }
    }

    if (photoUrls.length === 0) {
      const attemptedPhotos = source
        .getAll("photos")
        .filter(
          (file): file is File =>
            typeof File !== "undefined" && file instanceof File && file.size > 0
        );

      if (attemptedPhotos.length > MAX_WIZARD_FILES) {
        return jsonWithSession(
          {
            ok: false,
            requestId,
            message: `Envie no máximo ${MAX_WIZARD_FILES} fotos por vez.`,
          },
          400
        );
      }

      if (attemptedPhotos.length > 0) {
        const snapshots = await snapshotPhotoFiles(attemptedPhotos);
        const nodeEnv = process.env.NODE_ENV || "development";

        const pipeline = await runWizardPhotoUploadPipeline({
          snapshots,
          userId: ensured.session.id || "anon",
          accessToken: ensured.session.accessToken,
          requestId,
          forwardHeaders: backendHeaders,
          nodeEnv,
        });

        photoUrls = pipeline.photoUrls;

        if (photoUrls.length === 0) {
          const status = toSafeHttpStatus(pipeline.primaryError?.statusCode);
          const body: Record<string, unknown> = {
            ok: false,
            requestId,
            message:
              pipeline.primaryError?.message ||
              "Não foi possível salvar as fotos. Tente novamente.",
          };

          if (nodeEnv !== "production") {
            body.debug = {
              strategiesAttempted: pipeline.strategiesAttempted,
              errors: pipeline.errors.map(sanitizePipelineError),
              validUrlCount: 0,
              usedDraftPhotoUrls: false,
            };
          }

          console.error(`${LOG_PREFIX} photo upload failed`, {
            requestId,
            status,
            strategiesAttempted: pipeline.strategiesAttempted,
            errors: pipeline.errors.map((error) => ({
              stage: error.stage,
              code: error.code,
              statusCode: error.statusCode,
              message: error.message,
              backendUrl: error.backendUrl,
              backendRequestId: error.requestId,
            })),
          });

          return jsonWithSession(body, status);
        }
      }
    }

    if (photoUrls.length === 0) {
      return jsonWithSession(
        {
          ok: false,
          requestId,
          message: "Adicione pelo menos uma foto do veículo para publicar.",
        },
        400
      );
    }

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
