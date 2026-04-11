import { getBackendApiBaseUrl } from "@/lib/env/backend-api";
import { uploadPublishPhotosToBackendR2 } from "@/lib/painel/upload-ad-images-backend";
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

export type WizardPhotoUploadDeps = {
  isR2Configured: () => boolean;
  uploadDirectR2: (files: File[], userId: string) => Promise<string[]>;
  uploadBackend: (
    formData: FormData,
    accessToken: string,
    opts?: { forwardHeaders?: Record<string, string> }
  ) => Promise<string[]>;
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

export type WizardPipelineError = { stage: string; message: string };

export type RunWizardPhotoUploadPipelineResult = {
  photoUrls: string[];
  errors: WizardPipelineError[];
  strategiesAttempted: string[];
};

export type RunWizardPhotoUploadPipelineInput = {
  snapshots: PhotoSnapshot[];
  userId: string;
  accessToken: string;
  /** Headers do BFF (Authorization, Accept, X-Cnc-Client-Ip, …) */
  forwardHeaders?: Record<string, string>;
  nodeEnv: string;
  deps?: Partial<WizardPhotoUploadDeps>;
};

function mergeDeps(overrides?: Partial<WizardPhotoUploadDeps>): WizardPhotoUploadDeps {
  return { ...defaultWizardPhotoUploadDeps, ...overrides };
}

/**
 * Cascata: R2 direto no BFF → proxy backend → disco (apenas fora de production).
 * Observabilidade: logs no servidor com etapa e motivo da falha.
 */
export async function runWizardPhotoUploadPipeline(
  input: RunWizardPhotoUploadPipelineInput
): Promise<RunWizardPhotoUploadPipelineResult> {
  const deps = mergeDeps(input.deps);
  const errors: WizardPipelineError[] = [];
  const strategiesAttempted: string[] = [];
  let photoUrls: string[] = [];

  const photoCount = input.snapshots.length;
  const r2Configured = deps.isR2Configured();
  const backendBase = deps.getBackendBaseUrl();

  console.info(`${LOG_PREFIX} Início do upload`, {
    photoCount,
    r2Configured,
    hasBackendBaseUrl: Boolean(backendBase),
    nodeEnv: input.nodeEnv,
  });

  if (r2Configured) {
    strategiesAttempted.push("direct-r2");
    try {
      const files = filesFromSnapshots(input.snapshots);
      photoUrls = await deps.uploadDirectR2(files, input.userId);
      if (photoUrls.length === 0) {
        const msg =
          "R2 direto: 0 URLs (filtro MIME/tamanho ou ficheiros vazios após snapshot).";
        errors.push({ stage: "direct-r2", message: msg });
        console.warn(`${LOG_PREFIX} ${msg}`);
      } else {
        console.info(`${LOG_PREFIX} R2 direto OK`, {
          urlCount: photoUrls.length,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ stage: "direct-r2", message: msg });
      console.error(`${LOG_PREFIX} Falha no upload direto R2`, { message: msg });
    }
  } else {
    console.info(`${LOG_PREFIX} R2 direto ignorado (variáveis R2_* incompletas no BFF)`);
  }

  if (photoUrls.length === 0 && backendBase) {
    strategiesAttempted.push("backend-proxy");
    try {
      const fd = formDataFromSnapshots(input.snapshots);
      photoUrls = await deps.uploadBackend(fd, input.accessToken, {
        forwardHeaders: input.forwardHeaders,
      });
      if (photoUrls.length === 0) {
        const msg = "Proxy backend devolveu 0 URLs válidas.";
        errors.push({ stage: "backend-proxy", message: msg });
        console.warn(`${LOG_PREFIX} ${msg}`);
      } else {
        console.info(`${LOG_PREFIX} Proxy backend OK`, { urlCount: photoUrls.length });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ stage: "backend-proxy", message: msg });
      console.error(`${LOG_PREFIX} Falha no proxy backend`, { message: msg });
    }
  } else if (photoUrls.length === 0 && !backendBase) {
    const msg = "Base do backend não resolvida (AUTH_API_BASE_URL, BACKEND_API_URL, …).";
    errors.push({ stage: "backend-proxy", message: msg });
    console.error(`${LOG_PREFIX} ${msg}`);
  }

  if (photoUrls.length === 0 && input.nodeEnv !== "production") {
    strategiesAttempted.push("local-fs");
    try {
      const fd = formDataFromSnapshots(input.snapshots);
      photoUrls = await deps.saveLocal(fd);
      if (photoUrls.length === 0) {
        const msg = "Fallback local devolveu 0 URLs.";
        errors.push({ stage: "local-fs", message: msg });
        console.warn(`${LOG_PREFIX} ${msg}`);
      } else {
        console.info(`${LOG_PREFIX} Fallback local OK`, { urlCount: photoUrls.length });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ stage: "local-fs", message: msg });
      console.error(`${LOG_PREFIX} Falha no fallback local`, { message: msg });
    }
  }

  const validUrls = photoUrls.filter((u) => typeof u === "string" && u.trim().length > 0);
  console.info(`${LOG_PREFIX} Fim do upload`, {
    strategiesAttempted,
    validUrlCount: validUrls.length,
    errorStages: errors.map((e) => e.stage),
  });

  return { photoUrls: validUrls, errors, strategiesAttempted };
}
