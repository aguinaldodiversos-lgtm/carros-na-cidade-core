import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  normalizeMimeType,
  validateVehicleImageFile,
  validateVehicleImageFiles,
  generateVehicleImageKey,
} from "./r2.service.js";

// ---------------------------------------------------------------------------
// S3Client constructor mock — used only in the getR2Client describe block.
// vi.hoisted() is required so the mock variable is available inside vi.mock()
// (which is hoisted to the top of the file by the vitest transformer).
// Existing tests never call getR2Client so this mock has no side-effects.
// ---------------------------------------------------------------------------
const { S3ClientMock } = vi.hoisted(() => ({ S3ClientMock: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, S3Client: S3ClientMock };
});

// ---------------------------------------------------------------------------
// normalizeMimeType — prova objetiva do bug image/jpg
// ---------------------------------------------------------------------------

describe("normalizeMimeType", () => {
  it("mantém image/jpeg intacto", () => {
    expect(normalizeMimeType("image/jpeg")).toBe("image/jpeg");
  });

  it("converte image/jpg → image/jpeg (bug real: browser MIME não-canônico)", () => {
    // Este é o cenário de falha reportado: browser envia image/jpg,
    // assertAllowedMimeType rejeitava porque o Map só tem image/jpeg.
    expect(normalizeMimeType("image/jpg")).toBe("image/jpeg");
  });

  it("converte image/x-jpg → image/jpeg", () => {
    expect(normalizeMimeType("image/x-jpg")).toBe("image/jpeg");
  });

  it("converte image/pjpeg → image/jpeg (IE legacy)", () => {
    expect(normalizeMimeType("image/pjpeg")).toBe("image/jpeg");
  });

  it("mantém outros tipos de imagem intactos", () => {
    expect(normalizeMimeType("image/png")).toBe("image/png");
    expect(normalizeMimeType("image/webp")).toBe("image/webp");
    expect(normalizeMimeType("image/avif")).toBe("image/avif");
  });

  it("normaliza maiúsculas", () => {
    expect(normalizeMimeType("IMAGE/JPG")).toBe("image/jpeg");
    expect(normalizeMimeType("Image/Jpeg")).toBe("image/jpeg");
  });

  it("trata entrada vazia graciosamente", () => {
    expect(normalizeMimeType("")).toBe("");
    expect(normalizeMimeType(null)).toBe("");
    expect(normalizeMimeType(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// validateVehicleImageFile — integra normalizeMimeType na validação real
// ---------------------------------------------------------------------------

describe("validateVehicleImageFile — MIME image/jpg aceito após correção", () => {
  it("aceita arquivo com mimetype image/jpg e retorna mimeType normalizado image/jpeg", async () => {
    const file = {
      mimetype: "image/jpg",
      originalname: "veiculo-frontal.jpg",
      size: 1024,
      buffer: Buffer.alloc(1024),
    };

    const result = await validateVehicleImageFile(file);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.originalName).toBe("veiculo-frontal.jpg");
    expect(result.size).toBe(1024);
  });

  it("aceita arquivo com mimetype image/x-jpg", async () => {
    const file = {
      mimetype: "image/x-jpg",
      originalname: "foto.jpg",
      size: 512,
      buffer: Buffer.alloc(512),
    };

    const result = await validateVehicleImageFile(file);
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("rejeita tipo não permitido (ex.: application/pdf)", async () => {
    const file = {
      mimetype: "application/pdf",
      originalname: "documento.pdf",
      size: 1024,
      buffer: Buffer.alloc(1024),
    };

    await expect(validateVehicleImageFile(file)).rejects.toThrow(/Tipo de arquivo não permitido/);
  });

  it("rejeita arquivo vazio (size = 0)", async () => {
    const file = {
      mimetype: "image/jpeg",
      originalname: "foto.jpg",
      size: 0,
      buffer: Buffer.alloc(0),
    };

    await expect(validateVehicleImageFile(file)).rejects.toThrow(/inválido ou vazio/);
  });
});

// ---------------------------------------------------------------------------
// validateVehicleImageFile — limites de tamanho 6–10 MB (alinhamento confirmado)
// ---------------------------------------------------------------------------

describe("validateVehicleImageFile — tamanhos limítrofes 6–10 MB", () => {
  const SIX_MB = 6 * 1024 * 1024;
  const NINE_MB = 9 * 1024 * 1024;
  const TEN_MB = 10 * 1024 * 1024;
  const TEN_MB_PLUS_ONE = TEN_MB + 1;

  it("aceita arquivo de 6 MB exatos", async () => {
    const file = {
      mimetype: "image/jpeg",
      originalname: "foto-6mb.jpg",
      size: SIX_MB,
      buffer: Buffer.alloc(SIX_MB),
    };
    const result = await validateVehicleImageFile(file);
    expect(result.size).toBe(SIX_MB);
  });

  it("aceita arquivo de 9 MB", async () => {
    const file = {
      mimetype: "image/jpeg",
      originalname: "foto-9mb.jpg",
      size: NINE_MB,
      buffer: Buffer.alloc(NINE_MB),
    };
    const result = await validateVehicleImageFile(file);
    expect(result.size).toBe(NINE_MB);
  });

  it("aceita arquivo de exatamente 10 MB (limite máximo)", async () => {
    const file = {
      mimetype: "image/png",
      originalname: "foto-10mb.png",
      size: TEN_MB,
      buffer: Buffer.alloc(TEN_MB),
    };
    const result = await validateVehicleImageFile(file);
    expect(result.size).toBe(TEN_MB);
  });

  it("rejeita arquivo de 10 MB + 1 byte (acima do limite)", async () => {
    const file = {
      mimetype: "image/jpeg",
      originalname: "grande-demais.jpg",
      size: TEN_MB_PLUS_ONE,
      buffer: Buffer.alloc(TEN_MB_PLUS_ONE),
    };
    await expect(validateVehicleImageFile(file)).rejects.toThrow(/excede o limite/);
  });
});

// ---------------------------------------------------------------------------
// generateVehicleImageKey — nomes com acento são sanitizados na chave
// ---------------------------------------------------------------------------

describe("generateVehicleImageKey — sanitização de nomes acentuados", () => {
  it("remove acentos do nome original na chave gerada", () => {
    const key = generateVehicleImageKey({
      vehicleId: "pub-123",
      originalName: "veículo-frontal.jpg",
      mimeType: "image/jpeg",
    });

    // eslint-disable-next-line no-control-regex
    expect(key).not.toMatch(/[^\x00-\x7F]/);
    expect(key).toContain("veiculo-frontal");
  });

  it("sanitiza nome com cedilha e acento agudo", () => {
    const key = generateVehicleImageKey({
      vehicleId: "pub-456",
      originalName: "ação-lateral.jpg",
      mimeType: "image/jpeg",
    });

    // eslint-disable-next-line no-control-regex
    expect(key).not.toMatch(/[^\x00-\x7F]/);
    expect(key).toContain("acao-lateral");
  });

  it("usa extensão correta para image/jpg normalizado (via assertAllowedMimeType)", () => {
    const key = generateVehicleImageKey({
      vehicleId: "pub-789",
      originalName: "foto.jpg",
      mimeType: "image/jpeg",
    });

    expect(key).toMatch(/\.jpg$/);
  });

  it("key começa com vehicles/", () => {
    const key = generateVehicleImageKey({
      vehicleId: "test-id",
      originalName: "foto.png",
      mimeType: "image/png",
    });

    expect(key).toMatch(/^vehicles\/test-id\//);
  });
});

// ---------------------------------------------------------------------------
// validateVehicleImageFiles — limites de quantidade
// ---------------------------------------------------------------------------

describe("validateVehicleImageFiles — quantidade de arquivos", () => {
  function makeFile(size = 1024) {
    return {
      mimetype: "image/jpeg",
      originalname: "foto.jpg",
      size,
      buffer: Buffer.alloc(size),
    };
  }

  it("rejeita array vazio", async () => {
    await expect(validateVehicleImageFiles([])).rejects.toThrow(/Nenhuma imagem/);
  });

  it("aceita até 12 arquivos (limite padrão)", async () => {
    const files = Array.from({ length: 12 }, () => makeFile(1024));
    const results = await validateVehicleImageFiles(files);
    expect(results).toHaveLength(12);
  });

  it("rejeita mais de 12 arquivos (acima do DEFAULT_MAX_FILES)", async () => {
    const files = Array.from({ length: 13 }, () => makeFile(1024));
    await expect(validateVehicleImageFiles(files)).rejects.toThrow(/excede o limite/);
  });
});

// ---------------------------------------------------------------------------
// getR2Client — garante que S3Client é instanciado com os parâmetros obrigatórios
// para o Cloudflare R2.  Usa vi.resetModules() para limpar o cache do singleton
// (cachedClient) antes de cada teste.
// ---------------------------------------------------------------------------

describe("getR2Client — configuração obrigatória para Cloudflare R2", () => {
  const REQUIRED_VARS = {
    R2_ACCOUNT_ID: "test-account-123",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key",
    R2_BUCKET_NAME: "test-bucket",
  };
  const saved = {};

  beforeEach(() => {
    vi.resetModules();
    S3ClientMock.mockClear();
    for (const [k, v] of Object.entries(REQUIRED_VARS)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    delete process.env.AWS_REGION;
    delete process.env.R2_ENDPOINT;
  });

  afterEach(() => {
    for (const k of Object.keys(REQUIRED_VARS)) {
      if (saved[k] !== undefined) process.env[k] = saved[k];
      else delete process.env[k];
    }
  });

  it("forcePathStyle: true — obrigatório para R2 (sem isso: SignatureDoesNotMatch)", async () => {
    const { getR2Client } = await import("./r2.service.js");
    getR2Client();
    expect(S3ClientMock).toHaveBeenCalledTimes(1);
    const cfg = S3ClientMock.mock.calls[0][0];
    expect(cfg.forcePathStyle).toBe(true);
  });

  it("endpoint é construído a partir de R2_ACCOUNT_ID quando R2_ENDPOINT não está definido", async () => {
    const { getR2Client } = await import("./r2.service.js");
    getR2Client();
    const cfg = S3ClientMock.mock.calls[0][0];
    expect(cfg.endpoint).toBe("https://test-account-123.r2.cloudflarestorage.com");
  });

  it("R2_ENDPOINT customizado prevalece sobre o endpoint derivado de R2_ACCOUNT_ID", async () => {
    process.env.R2_ENDPOINT = "https://custom.r2endpoint.example.com";
    const { getR2Client } = await import("./r2.service.js");
    getR2Client();
    const cfg = S3ClientMock.mock.calls[0][0];
    expect(cfg.endpoint).toBe("https://custom.r2endpoint.example.com");
  });

  it("region padrão é 'auto' quando AWS_REGION não está definido", async () => {
    const { getR2Client } = await import("./r2.service.js");
    getR2Client();
    const cfg = S3ClientMock.mock.calls[0][0];
    expect(cfg.region).toBe("auto");
  });

  it("credenciais são passadas corretamente ao S3Client", async () => {
    const { getR2Client } = await import("./r2.service.js");
    getR2Client();
    const cfg = S3ClientMock.mock.calls[0][0];
    expect(cfg.credentials.accessKeyId).toBe("test-access-key");
    expect(cfg.credentials.secretAccessKey).toBe("test-secret-key");
  });
});
