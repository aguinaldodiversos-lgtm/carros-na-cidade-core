import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  const savedEnv: Record<string, string | undefined> = {};
  const ENV_KEYS = ["ENABLE_BFF_DIRECT_R2_UPLOAD", "ALLOW_LOCAL_UPLOAD_FALLBACK"] as const;

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k];
      else delete process.env[k];
    }
  });

  it("sucesso: backend-proxy devolve itens e não chama direct-r2", async () => {
    const uploadDirectR2 = vi.fn();
    const r = await runWizardPhotoUploadPipeline({
      snapshots: [oneSnapshot()],
      userId: "user-1",
      accessToken: "tok",
      nodeEnv: "production",
      deps: {
        isR2Configured: () => true,
        uploadDirectR2,
        uploadBackend: vi.fn(async () => [
          { url: "https://api.example/1.jpg", source: "backend-r2" as const },
        ]),
        saveLocal: vi.fn(),
        getBackendBaseUrl: () => "http://127.0.0.1:4000",
      },
    });

    expect(r.photoUrls).toEqual(["https://api.example/1.jpg"]);
    expect(r.strategiesAttempted).toEqual(["backend-proxy"]);
    expect(uploadDirectR2).not.toHaveBeenCalled();
  });

  it("backend falha e direct-r2 consegue (fallback com flag ligada)", async () => {
    process.env.ENABLE_BFF_DIRECT_R2_UPLOAD = "true";
    const r = await runWizardPhotoUploadPipeline({
      snapshots: [oneSnapshot()],
      userId: "user-1",
      accessToken: "tok",
      forwardHeaders: { "X-Cnc-Client-Ip": "198.51.100.2" },
      nodeEnv: "production",
      deps: {
        isR2Configured: () => true,
        uploadDirectR2: vi.fn(async () => ["https://r2/1.jpg"]),
        uploadBackend: vi.fn(async () => {
          throw new Error("backend down");
        }),
        saveLocal: vi.fn(),
        getBackendBaseUrl: () => "http://127.0.0.1:4000",
      },
    });

    expect(r.photoUrls).toEqual(["https://r2/1.jpg"]);
    expect(r.strategiesAttempted).toEqual(["backend-proxy", "direct-r2"]);
    expect(r.errors.some((e) => e.stage === "backend-proxy")).toBe(true);
  });

  it("falha total em production: sem URLs", async () => {
    process.env.ENABLE_BFF_DIRECT_R2_UPLOAD = "true";
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
    expect(r.strategiesAttempted).toContain("backend-proxy");
    expect(r.strategiesAttempted).toContain("direct-r2");
    expect(r.strategiesAttempted).not.toContain("local-fs");
  });

  it("development: tenta local-fs quando backend falha (com flag ligada)", async () => {
    process.env.ALLOW_LOCAL_UPLOAD_FALLBACK = "true";
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
  // Cenário C — nome acentuado: a formData enviada ao backend deve preservar
  // o nome original do snapshot
  // -------------------------------------------------------------------------

  it("snapshot com nome acentuado é repassado sem corrupção ao uploadBackend", async () => {
    const capturedFormData: FormData[] = [];
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
        uploadDirectR2: vi.fn(),
        uploadBackend: vi.fn(async (fd: FormData) => {
          capturedFormData.push(fd);
          return [
            { url: "https://api.example/1.jpg", source: "backend-r2" as const },
            { url: "https://api.example/2.jpg", source: "backend-r2" as const },
          ];
        }),
        saveLocal: vi.fn(),
        getBackendBaseUrl: () => "http://127.0.0.1:4000",
      },
    });

    expect(r.photoUrls).toHaveLength(2);
    expect(capturedFormData).toHaveLength(1);
    const files = capturedFormData[0].getAll("photos").filter((x): x is File => x instanceof File);
    expect(files[0].name).toBe("veículo-frontal.jpg");
    expect(files[1].name).toBe("ação-lateral.png");
  });

  // -------------------------------------------------------------------------
  // Cenário D — image/jpg: o pipeline preserva o tipo ao montar a FormData
  // enviada ao backend
  // -------------------------------------------------------------------------

  it("snapshot com type image/jpg é repassado ao uploadBackend sem rejeição", async () => {
    let capturedType = "";
    const r = await runWizardPhotoUploadPipeline({
      snapshots: [oneSnapshot({ type: "image/jpg" })],
      userId: "user-1",
      accessToken: "tok",
      nodeEnv: "production",
      deps: {
        isR2Configured: () => true,
        uploadDirectR2: vi.fn(),
        uploadBackend: vi.fn(async (fd: FormData) => {
          const file = fd.getAll("photos").find((x): x is File => x instanceof File);
          capturedType = file?.type ?? "";
          return [{ url: "https://api.example/1.jpg", source: "backend-r2" as const }];
        }),
        saveLocal: vi.fn(),
        getBackendBaseUrl: () => "http://127.0.0.1:4000",
      },
    });

    expect(r.photoUrls).toHaveLength(1);
    expect(capturedType).toBe("image/jpg");
  });

  // -------------------------------------------------------------------------
  // Cenário E — arquivo entre 6–10 MB: tamanho passa sem truncamento
  // -------------------------------------------------------------------------

  it("snapshot de 7 MB é repassado ao uploadBackend com buffer íntegro", async () => {
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
        uploadDirectR2: vi.fn(),
        uploadBackend: vi.fn(async (fd: FormData) => {
          const file = fd.getAll("photos").find((x): x is File => x instanceof File);
          capturedSize = file?.size ?? 0;
          return [{ url: "https://api.example/big.jpg", source: "backend-r2" as const }];
        }),
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
    process.env.ENABLE_BFF_DIRECT_R2_UPLOAD = "true";
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
    expect(r.errors[0]).toMatchObject({ stage: "backend-proxy", message: "gateway timeout" });
    expect(r.errors[1]).toMatchObject({ stage: "direct-r2", message: "credenciais inválidas" });
    expect(r.photoUrls).toEqual([]);
  });
});
