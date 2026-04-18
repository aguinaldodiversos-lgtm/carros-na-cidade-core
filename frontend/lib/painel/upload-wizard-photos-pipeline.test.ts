import { describe, it, expect, vi } from "vitest";
import { runWizardPhotoUploadPipeline } from "./upload-wizard-photos-pipeline";
import type { PhotoSnapshot } from "./upload-draft-photo-snapshots";

function oneSnapshot(opts?: Partial<PhotoSnapshot>): PhotoSnapshot {
  return {
    name: "a.jpg",
    type: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff]),
    ...opts,
  };
}

describe("runWizardPhotoUploadPipeline", () => {
  it("sucesso: R2 direto devolve URLs e não chama backend", async () => {
    const uploadBackend = vi.fn();
    const r = await runWizardPhotoUploadPipeline({
      snapshots: [oneSnapshot()],
      userId: "user-1",
      accessToken: "tok",
      nodeEnv: "production",
      deps: {
        isR2Configured: () => true,
        uploadDirectR2: vi.fn(async () => ["https://r2/1.jpg"]),
        uploadBackend,
        saveLocal: vi.fn(),
        getBackendBaseUrl: () => "http://127.0.0.1:4000",
      },
    });

    expect(r.photoUrls).toEqual(["https://r2/1.jpg"]);
    expect(r.strategiesAttempted).toEqual(["direct-r2"]);
    expect(uploadBackend).not.toHaveBeenCalled();
  });

  it("R2 falha e backend consegue (fallback)", async () => {
    const r = await runWizardPhotoUploadPipeline({
      snapshots: [oneSnapshot()],
      userId: "user-1",
      accessToken: "tok",
      forwardHeaders: { "X-Cnc-Client-Ip": "198.51.100.2" },
      nodeEnv: "production",
      deps: {
        isR2Configured: () => true,
        uploadDirectR2: vi.fn(async () => {
          throw new Error("R2 PutObject recusado");
        }),
        uploadBackend: vi.fn(async () => [
          { url: "https://api.example/1.jpg", source: "backend-r2" as const },
        ]),
        saveLocal: vi.fn(),
        getBackendBaseUrl: () => "http://127.0.0.1:4000",
      },
    });

    expect(r.photoUrls).toEqual(["https://api.example/1.jpg"]);
    expect(r.strategiesAttempted).toEqual(["direct-r2", "backend-proxy"]);
    expect(r.errors.some((e) => e.stage === "direct-r2")).toBe(true);
  });

  it("falha total em production: sem URLs", async () => {
    const r = await runWizardPhotoUploadPipeline({
      snapshots: [oneSnapshot()],
      userId: "user-1",
      accessToken: "tok",
      nodeEnv: "production",
      deps: {
        isR2Configured: () => true,
        uploadDirectR2: vi.fn(async () => []),
        uploadBackend: vi.fn(async () => {
          throw new Error("backend down");
        }),
        saveLocal: vi.fn(),
        getBackendBaseUrl: () => "http://127.0.0.1:4000",
      },
    });

    expect(r.photoUrls).toEqual([]);
    expect(r.strategiesAttempted).toContain("direct-r2");
    expect(r.strategiesAttempted).toContain("backend-proxy");
    expect(r.strategiesAttempted).not.toContain("local-fs");
  });

  it("development: tenta local-fs quando R2 e backend falham", async () => {
    const r = await runWizardPhotoUploadPipeline({
      snapshots: [oneSnapshot()],
      userId: "user-1",
      accessToken: "tok",
      nodeEnv: "development",
      deps: {
        isR2Configured: () => false,
        uploadDirectR2: vi.fn(),
        uploadBackend: vi.fn(async () => {
          throw new Error("offline");
        }),
        saveLocal: vi.fn(async () => ["/uploads/ads/x.jpg"]),
        getBackendBaseUrl: () => "http://127.0.0.1:4000",
      },
    });

    expect(r.photoUrls).toEqual(["/uploads/ads/x.jpg"]);
    expect(r.strategiesAttempted).toContain("local-fs");
  });

  // -------------------------------------------------------------------------
  // Cenário C — nome acentuado: o pipeline deve passar o snapshot íntegro
  // -------------------------------------------------------------------------

  it("snapshot com nome acentuado é passado sem corrupção ao uploadDirectR2", async () => {
    const capturedFiles: File[] = [];
    const r = await runWizardPhotoUploadPipeline({
      snapshots: [
        oneSnapshot({ name: "veículo-frontal.jpg", type: "image/jpeg" }),
        oneSnapshot({ name: "ação-lateral.png", type: "image/png" }),
      ],
      userId: "user-1",
      accessToken: "tok",
      nodeEnv: "production",
      deps: {
        isR2Configured: () => true,
        uploadDirectR2: vi.fn(async (files: File[]) => {
          capturedFiles.push(...files);
          return ["https://r2/1.jpg", "https://r2/2.jpg"];
        }),
        uploadBackend: vi.fn(),
        saveLocal: vi.fn(),
        getBackendBaseUrl: () => "http://127.0.0.1:4000",
      },
    });

    expect(r.photoUrls).toHaveLength(2);
    expect(capturedFiles[0].name).toBe("veículo-frontal.jpg");
    expect(capturedFiles[1].name).toBe("ação-lateral.png");
    // Pipeline deve preservar o nome original — sanitização ocorre no r2.service
    // (Metadata), não no nome do arquivo em si
  });

  // -------------------------------------------------------------------------
  // Cenário D — image/jpg: o pipeline passa o tipo ao uploadDirectR2 sem
  // filtrar (filtragem e normalização são responsabilidade do upload layer)
  // -------------------------------------------------------------------------

  it("snapshot com type image/jpg é repassado ao uploadDirectR2 sem rejeição no pipeline", async () => {
    let capturedType = "";
    const r = await runWizardPhotoUploadPipeline({
      snapshots: [oneSnapshot({ type: "image/jpg" })],
      userId: "user-1",
      accessToken: "tok",
      nodeEnv: "production",
      deps: {
        isR2Configured: () => true,
        uploadDirectR2: vi.fn(async (files: File[]) => {
          capturedType = files[0]?.type ?? "";
          return ["https://r2/1.jpg"];
        }),
        uploadBackend: vi.fn(),
        saveLocal: vi.fn(),
        getBackendBaseUrl: () => "http://127.0.0.1:4000",
      },
    });

    expect(r.photoUrls).toHaveLength(1);
    // O pipeline preserva o tipo — normalização para image/jpeg ocorre
    // dentro de uploadDraftPhotosDirectR2 (normalizeMimeForR2Filter)
    expect(capturedType).toBe("image/jpg");
  });

  // -------------------------------------------------------------------------
  // Cenário E — arquivo entre 6–10 MB: tamanho passa sem truncamento
  // -------------------------------------------------------------------------

  it("snapshot de 7 MB é passado ao uploadDirectR2 com buffer íntegro", async () => {
    const SEVEN_MB = 7 * 1024 * 1024;
    const bigBuffer = Buffer.alloc(SEVEN_MB, 0xff);
    let capturedSize = 0;

    const r = await runWizardPhotoUploadPipeline({
      snapshots: [{ name: "foto-grande.jpg", type: "image/jpeg", buffer: bigBuffer }],
      userId: "user-1",
      accessToken: "tok",
      nodeEnv: "production",
      deps: {
        isR2Configured: () => true,
        uploadDirectR2: vi.fn(async (files: File[]) => {
          capturedSize = files[0]?.size ?? 0;
          return ["https://r2/big.jpg"];
        }),
        uploadBackend: vi.fn(),
        saveLocal: vi.fn(),
        getBackendBaseUrl: () => "http://127.0.0.1:4000",
      },
    });

    expect(r.photoUrls).toHaveLength(1);
    expect(capturedSize).toBe(SEVEN_MB);
  });

  // -------------------------------------------------------------------------
  // Observabilidade: errors e strategiesAttempted bem formados em fallback
  // -------------------------------------------------------------------------

  it("errors contém stage e message para cada falha", async () => {
    const r = await runWizardPhotoUploadPipeline({
      snapshots: [oneSnapshot()],
      userId: "user-1",
      accessToken: "tok",
      nodeEnv: "production",
      deps: {
        isR2Configured: () => true,
        uploadDirectR2: vi.fn(async () => {
          throw new Error("credenciais inválidas");
        }),
        uploadBackend: vi.fn(async () => {
          throw new Error("gateway timeout");
        }),
        saveLocal: vi.fn(),
        getBackendBaseUrl: () => "http://127.0.0.1:4000",
      },
    });

    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatchObject({ stage: "direct-r2", message: "credenciais inválidas" });
    expect(r.errors[1]).toMatchObject({ stage: "backend-proxy", message: "gateway timeout" });
    expect(r.photoUrls).toEqual([]);
  });
});
