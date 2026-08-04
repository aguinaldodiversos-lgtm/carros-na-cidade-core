/**
 * O caminho `direct-r2` não pode subir formato que o navegador não exibe.
 *
 * Ele é a estratégia PRIMÁRIA do wizard e, ao contrário do backend, NÃO
 * normaliza: `PutObject` recebe o buffer exatamente como chegou, sem sharp.
 * Um HEIC subiria cru e o anúncio publicaria com foto que só o Safari
 * renderiza — quebrada e sem erro nenhum.
 *
 * ─── POR QUE ESTE TESTE FOI REESCRITO ──────────────────────────────────────
 * A primeira versão (commit d463abee) importava `validateVehicleImageFile` de
 * `frontend/infrastructure/storage/r2.service.js` — módulo que NÃO é importado
 * por nenhum código de produção, só pelo próprio teste. Ele passava verde
 * enquanto o caminho real seguia aceitando HEIC: falsa confiança.
 *
 * Agora o teste exercita `uploadDraftPhotosDirectR2`, a função que o pipeline
 * realmente chama, e verifica o EFEITO (nenhum PutObject enviado) em vez de
 * inspecionar uma constante. Constante pode ser duplicada; efeito, não.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { S3ClientMock, sendMock } = vi.hoisted(() => {
  const sendMock = vi.fn().mockResolvedValue({});
  return {
    sendMock,
    S3ClientMock: vi.fn(() => ({ send: sendMock })),
  };
});

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, S3Client: S3ClientMock };
});

const ORIGINAL_ENV = { ...process.env };

function setR2Env() {
  process.env.R2_ACCOUNT_ID = "test-account";
  process.env.R2_ACCESS_KEY_ID = "test-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.R2_BUCKET_NAME = "test-bucket";
  process.env.R2_PUBLIC_BASE_URL = "https://pub-test.r2.dev";
}

/** `File` com bytes suficientes para passar no guard de tamanho. */
function fakeFile(name: string, type: string): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])], name, { type });
}

async function upload(files: File[]) {
  const mod = await import("./upload-draft-photos-direct-r2");
  return mod.uploadDraftPhotosDirectR2(files, "122");
}

beforeEach(() => {
  vi.resetModules();
  sendMock.mockClear();
  S3ClientMock.mockClear();
  setR2Env();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("direct-r2 — formatos que subiriam CRUS para o R2", () => {
  it.each([
    ["image/heic", "IMG_0001.heic"],
    ["image/heif", "IMG_0001.heif"],
    ["image/avif", "foto.avif"],
  ])("NÃO envia %s ao R2", async (mime, name) => {
    const urls = await upload([fakeFile(name, mime)]);

    expect(urls).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it.each([
    ["image/jpeg", "foto.jpg"],
    ["image/png", "foto.png"],
    ["image/webp", "foto.webp"],
  ])("envia %s normalmente — o caminho feliz não foi estreitado", async (mime, name) => {
    const urls = await upload([fakeFile(name, mime)]);

    expect(urls).toHaveLength(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("aliases de JPEG continuam aceitos (image/jpg do Android)", async () => {
    const urls = await upload([fakeFile("foto.jpg", "image/jpg")]);
    expect(urls).toHaveLength(1);
  });

  /**
   * O caso que mais importa: lote misto. Um HEIC no meio não pode nem subir
   * cru nem derrubar as fotos boas — ele é simplesmente descartado aqui, e o
   * backend (que normaliza e sabe recusar com 415 legível) trata o resto.
   */
  it("lote misto sobe só os formatos válidos", async () => {
    const urls = await upload([
      fakeFile("a.jpg", "image/jpeg"),
      fakeFile("b.heic", "image/heic"),
      fakeFile("c.png", "image/png"),
    ]);

    expect(urls).toHaveLength(2);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("nenhuma chave gravada termina em .heic/.heif/.avif", async () => {
    await upload([
      fakeFile("a.jpg", "image/jpeg"),
      fakeFile("b.heic", "image/heic"),
      fakeFile("c.heif", "image/heif"),
    ]);

    const keys = sendMock.mock.calls.map((call) => call[0]?.input?.Key ?? "");
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).not.toMatch(/\.(heic|heif|avif)$/i);
    }
  });
});
