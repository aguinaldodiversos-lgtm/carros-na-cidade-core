import { getBackendApiBaseUrl } from "@/lib/env/backend-api";
import {
  UploadBackendError,
  type UploadedPhotoItem,
  uploadPublishPhotosToBackendR2,
} from "@/lib/painel/upload-ad-images-backend";
import { saveWizardPhotosToPublic } from "@/lib/painel/save-ad-photos";
import {
  filesFromSnapshots,
  formDataFromSnapshots,
  type PhotoSnapshot,
} from "@/lib/painel/upload-draft-photo-snapshots";
import {
  isR2ConfiguredInBff,
  uploadDraftPhotosDirectR2,
} from "@/lib/painel/upload-draft-photos-direct-r2";

const LOG_PREFIX = "[upload-draft-photos]";

function envBool(key: string, fallback = false): boolean {
  const raw = (process.env[key] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
}

function toUploadedPhotoItem(url: string, source: UploadedPhotoItem["source"]): UploadedPhotoItem {
  return {
    url,
    source,
  };
}

function normalizeUploadedItems(items: UploadedPhotoItem[]): UploadedPhotoItem[] {
  const seen = new Set<string>();
  const normalized: UploadedPhotoItem[] = [];

  for (const item of items) {
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!url || seen.has(url)) continue;

    seen.add(url);
    normalized.push({
      url,
      key: item.key?.trim() || undefined,
      mimeType: item.mimeType?.trim() || undefined,
      width: Number.isFinite(item.width) ? item.width : undefined,
      height: Number.isFinite(item.height) ? item.height : undefined,
      sizeBytes: Number.isFinite(item.sizeBytes) ? item.sizeBytes : undefined,
      source: item.source,
    });
  }

  return normalized;
}

function shouldEnableDirectR2Fallback(nodeEnv: string): boolean {
  if (nodeEnv === "production") {
    return envBool("ENABLE_BFF_DIRECT_R2_UPLOAD", false);
  }
  return envBool("ENABLE_BFF_DIRECT_R2_UPLOAD", false);
}

function shouldEnableLocalFallback(nodeEnv: string): boolean {
  if (nodeEnv === "production") return false;
  return envBool("ALLOW_LOCAL_UPLOAD_FALLBACK", false);
}

export type WizardPhotoUploadDeps = {
  isR2Configured: () => boolean;
  uploadDirectR2: (files: File[], userId: string) => Promise<string[]>;
  uploadBackend: (
    formData: FormData,
    accessToken: string,
    opts?: { forwardHeaders?: Record<string, string>; requestId?: string }
  ) => Promise<UploadedPhotoItem[]>;
  saveLocal: (formData: FormData) => Promise<string[]>;
  getBackendBaseUrl: () => string;
};

export const defaultWizardPhotoUploadDeps: WizardPhotoUploadDeps = {
  isR2Configured: isR2ConfiguredInBff,
  uploadDirectR2: uploadDraftPhotosDirectR2,
  uploadBackend: uploadPublishPhotosToBackendR2,
  saveLocal: saveWizardPhotosToPublic,
  getBackendBaseUrl: getBackendApiBaseUrl,
};

export type WizardPipelineError = {
  stage: string;
  message: string;
  statusCode?: number;
  code?: string;
  requestId?: string;
  backendUrl?: string;
  details?: Record<string, unknown>;
};

export type RunWizardPhotoUploadPipelineResult = {
  items: UploadedPhotoItem[];
  photoUrls: string[];
  errors: WizardPipelineError[];
  strategiesAttempted: string[];
  primaryError?: WizardPipelineError;
};

export type RunWizardPhotoUploadPipelineInput = {
  snapshots: PhotoSnapshot[];
  userId: string;
  accessToken: string;
  requestId: string;
  /** Headers do BFF (Authorization, Accept, X-Cnc-Client-Ip, …) */
  forwardHeaders?: Record<string, string>;
  nodeEnv: string;
  deps?: Partial<WizardPhotoUploadDeps>;
};

function mergeDeps(overrides?: Partial<WizardPhotoUploadDeps>): WizardPhotoUploadDeps {
  return { ...defaultWizardPhotoUploadDeps, ...overrides };
}

function toPipelineError(stage: string, error: unknown): WizardPipelineError {
  if (error instanceof UploadBackendError) {
    return {
      stage,
      message: error.message,
      statusCode: error.statusCode,
      code: error.code,
      requestId: error.requestId,
      backendUrl: error.backendUrl,
      details: error.details,
    };
  }

  const message = error instanceof Error ? error.message : String(error);

  return {
    stage,
    message,
  };
}

/**
 * Produção:
 *   backend-proxy é o writer canônico
 *   direct-r2 só entra com flag explícita
 *   local-fs nunca entra
 *
 * Desenvolvimento:
 *   backend-proxy continua sendo o writer preferencial
 *   direct-r2 e local-fs são opcionais, via flags explícitas
 */
export async function runWizardPhotoUploadPipeline(
  input: RunWizardPhotoUploadPipelineInput
): Promise<RunWizardPhotoUploadPipelineResult> {
  const deps = mergeDeps(input.deps);
  const errors: WizardPipelineError[] = [];
  const strategiesAttempted: string[] = [];
  let items: UploadedPhotoItem[] = [];

  const photoCount = input.snapshots.length;
  const backendBase = deps.getBackendBaseUrl();
  const directR2Enabled = shouldEnableDirectR2Fallback(input.nodeEnv) && deps.isR2Configured();
  const localFallbackEnabled = shouldEnableLocalFallback(input.nodeEnv);

  console.info(`${LOG_PREFIX} start`, {
    requestId: input.requestId,
    photoCount,
    nodeEnv: input.nodeEnv,
    hasBackendBaseUrl: Boolean(backendBase),
    directR2Enabled,
    localFallbackEnabled,
  });

  /**
   * Estratégia principal: backend-proxy.
   * Mantém um único ponto de verdade para validação, normalização e persistência.
   */
  if (backendBase) {
    strategiesAttempted.push("backend-proxy");

    try {
      const formData = formDataFromSnapshots(input.snapshots);
      items = await deps.uploadBackend(formData, input.accessToken, {
        forwardHeaders: input.forwardHeaders,
        requestId: input.requestId,
      });

      items = normalizeUploadedItems(items);

      if (items.length === 0) {
        const message = "Proxy backend devolveu 0 itens de imagem válidos.";
        errors.push({ stage: "backend-proxy", message });
        console.warn(`${LOG_PREFIX} backend-proxy returned 0 items`, {
          requestId: input.requestId,
        });
      } else {
        console.info(`${LOG_PREFIX} backend-proxy ok`, {
          requestId: input.requestId,
          itemCount: items.length,
        });
      }
    } catch (error) {
      const mapped = toPipelineError("backend-proxy", error);
      errors.push(mapped);

      console.error(`${LOG_PREFIX} backend-proxy failed`, {
        requestId: input.requestId,
        statusCode: mapped.statusCode,
        code: mapped.code,
        message: mapped.message,
        backendUrl: mapped.backendUrl,
        backendRequestId: mapped.requestId,
      });
    }
  } else {
    const message =
      "Base do backend não resolvida. Configure AUTH_API_BASE_URL, BACKEND_API_URL, CNC_API_URL, API_URL ou NEXT_PUBLIC_API_URL.";
    errors.push({
      stage: "backend-proxy",
      message,
      code: "BACKEND_BASE_URL_MISSING",
    });

    console.error(`${LOG_PREFIX} backend base missing`, {
      requestId: input.requestId,
    });
  }

  /**
   * Fallback opcional de laboratório.
   * Em produção, só habilita se ENABLE_BFF_DIRECT_R2_UPLOAD=true.
   * Ele NÃO é o writer preferencial.
   */
  if (items.length === 0 && directR2Enabled) {
    strategiesAttempted.push("direct-r2");

    try {
      const files = filesFromSnapshots(input.snapshots);
      const urls = uniqueNonEmptyStrings(
        await deps.uploadDirectR2(files, input.userId)
      );

      items = normalizeUploadedItems(urls.map((url) => toUploadedPhotoItem(url, "bff-direct-r2")));

      if (items.length === 0) {
        const message = "R2 direto devolveu 0 URLs válidas.";
        errors.push({ stage: "direct-r2", message });

        console.warn(`${LOG_PREFIX} direct-r2 returned 0 urls`, {
          requestId: input.requestId,
        });
      } else {
        console.warn(`${LOG_PREFIX} direct-r2 fallback used`, {
          requestId: input.requestId,
          itemCount: items.length,
        });
      }
    } catch (error) {
      const mapped = toPipelineError("direct-r2", error);
      errors.push(mapped);

      console.error(`${LOG_PREFIX} direct-r2 failed`, {
        requestId: input.requestId,
        message: mapped.message,
      });
    }
  }

  /**
   * Fallback local só para desenvolvimento, via flag explícita.
   */
  if (items.length === 0 && localFallbackEnabled) {
    strategiesAttempted.push("local-fs");

    try {
      const formData = formDataFromSnapshots(input.snapshots);
      const urls = uniqueNonEmptyStrings(await deps.saveLocal(formData));

      items = normalizeUploadedItems(urls.map((url) => toUploadedPhotoItem(url, "local-fs")));

      if (items.length === 0) {
        const message = "Fallback local devolveu 0 URLs válidas.";
        errors.push({ stage: "local-fs", message });

        console.warn(`${LOG_PREFIX} local-fs returned 0 urls`, {
          requestId: input.requestId,
        });
      } else {
        console.warn(`${LOG_PREFIX} local-fs fallback used`, {
          requestId: input.requestId,
          itemCount: items.length,
        });
      }
    } catch (error) {
      const mapped = toPipelineError("local-fs", error);
      errors.push(mapped);

      console.error(`${LOG_PREFIX} local-fs failed`, {
        requestId: input.requestId,
        message: mapped.message,
      });
    }
  }

  const photoUrls = items.map((item) => item.url);
  const primaryError = errors[0];

  console.info(`${LOG_PREFIX} finish`, {
    requestId: input.requestId,
    strategiesAttempted,
    validItemCount: items.length,
    errorStages: errors.map((error) => error.stage),
  });

  return {
    items,
    photoUrls,
    errors,
    strategiesAttempted,
    primaryError,
  };
}
