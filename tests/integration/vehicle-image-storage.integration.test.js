import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

import {
  applyStorageEnv,
  buildTestS3Client,
  ensureTestBucket,
} from "../../scripts/e2e-storage-prepare.mjs";

/**
 * O CONTRATO DE STORAGE QUE CAUSOU O BUG-ENV-01.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE FALHAVA, E POR QUÊ ESTE ARQUIVO EXISTE
 * ────────────────────────────────────────────────────────────────────────────
 * Sem storage configurado, o caminho crítico morria assim:
 *
 *   1. `POST /api/ads/upload-images` → 500 (`[r2] Variável obrigatória ausente:
 *      R2_ACCOUNT_ID`);
 *   2. o BFF caía no fallback de disco e devolvia URL RELATIVA;
 *   3. `POST /api/painel/anuncios` → 400, porque só aceita referência absoluta
 *      ou o proxy `/api/vehicle-images?key=…`.
 *
 * O produto estava certo nos três passos. Faltava a dependência.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * "RESPONDEU 200" NÃO É PROVA
 * ────────────────────────────────────────────────────────────────────────────
 * Um teste que só verificasse o status do upload passaria com um storage que
 * aceita bytes e os joga fora. O que precisa ser provado é a CADEIA inteira:
 *
 *   • o objeto EXISTE depois do upload (HeadObject por fora do adapter);
 *   • o backend consegue LER de volta os mesmos bytes;
 *   • a referência devolvida é aceitável para a publicação;
 *   • objeto inexistente continua sendo RECUSADO.
 *
 * O último caso é o que impede o teste de virar decorativo: se a leitura
 * respondesse "ok" para qualquer chave, os três primeiros passariam mesmo com o
 * storage quebrado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ADAPTER DE PRODUÇÃO, SEM MOCK
 * ────────────────────────────────────────────────────────────────────────────
 * Importa `src/infrastructure/storage/r2.service.js` — o mesmo módulo que a
 * rota `/api/ads/upload-images` usa. Nada é substituído: o teste exercita
 * validação de MIME, normalização para WebP, geração de chave, PutObject
 * assinado, metadados e leitura. A única diferença para produção é o valor de
 * `R2_ENDPOINT`.
 *
 * Rodar (Docker de pé):
 *   npm run integration:db:up && npm run storage:prepare
 *   npx vitest run tests/integration/vehicle-image-storage.integration.test.js
 */

// ORDEM CRÍTICA: `getR2Config()` memoriza a configuração na primeira chamada,
// e o módulo lê `process.env` no momento em que é usado. As variáveis precisam
// existir ANTES do import dinâmico abaixo.
applyStorageEnv(process.env);

const storage = await import("../../src/infrastructure/storage/r2.service.js");

/** PNG 1×1 válido — entra como PNG e o adapter normaliza para WebP. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/**
 * O `File` do multer chega como `{ buffer, originalname, mimetype, size }`.
 * Reproduzimos essa forma para atravessar o mesmo validador do produto.
 */
function arquivoSintetico(nome = "e2e-foto.png") {
  return {
    buffer: PNG_1X1,
    originalname: nome,
    mimetype: "image/png",
    size: PNG_1X1.length,
  };
}

/**
 * Espelha `isLikelyHttpUrl` de `frontend/app/api/painel/anuncios/route.ts:114`.
 *
 * Duplicar a regra aqui é deliberado: o backend e o BFF vivem em runtimes
 * diferentes e não compartilham módulo. O que este teste garante é que a
 * referência produzida pelo backend SATISFAZ o validador da publicação — foi
 * justamente a violação desse contrato (URL relativa do fallback de disco) que
 * produziu o 400 do BUG-ENV-01.
 */
function referenciaAceitaPelaPublicacao(value) {
  if (!value) return false;
  if (value.startsWith("/api/vehicle-images?")) return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Reproduz a montagem de URL de `ads.controller.js:uploadPublishImages`. */
function referenciaDoUpload(upload) {
  if (upload.publicUrl) return upload.publicUrl;
  return `/api/vehicle-images?key=${encodeURIComponent(upload.key)}`;
}

const client = buildTestS3Client(process.env);
const bucket = process.env.R2_BUCKET_NAME;
const chavesCriadas = [];

beforeAll(async () => {
  await ensureTestBucket({ log: () => {} });
}, 60_000);

afterAll(async () => {
  // Limpeza: objetos de teste não sobrevivem à execução. O bucket fica (é do
  // ambiente), os objetos não.
  for (const key of chavesCriadas) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
  }
  client.destroy?.();
});

describe("bucket de teste", () => {
  it("existe e é listável pelo mesmo caminho assinado do produto", async () => {
    const r = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    expect(r.$metadata.httpStatusCode).toBe(200);
  });

  it("o endpoint em uso NÃO é o da Cloudflare", () => {
    // Guarda contra o pior engano possível: rodar a suíte destrutiva contra o
    // bucket real. O endpoint de teste é local por construção.
    expect(process.env.R2_ENDPOINT).not.toMatch(/r2\.cloudflarestorage\.com/i);
    expect(new URL(process.env.R2_ENDPOINT).hostname).toMatch(/^(127\.0\.0\.1|localhost|minio)/);
  });
});

describe("upload → objeto existe → backend confirma", () => {
  it("o upload devolve chave, tamanho e etag reais", async () => {
    const upload = await storage.uploadVehicleImage({
      vehicleId: `e2e-storage-${Date.now()}`,
      file: arquivoSintetico(),
      uploadedByUserId: "e2e",
    });
    chavesCriadas.push(upload.key);

    expect(upload.key).toMatch(/\.webp$/);
    expect(upload.mimeType).toBe("image/webp");
    expect(upload.sizeBytes).toBeGreaterThan(0);
    expect(upload.etag, "sem ETag o objeto não foi realmente gravado").toBeTruthy();
    expect(upload.bucket).toBe(bucket);
  }, 60_000);

  it("o objeto EXISTE no storage — verificado por fora do adapter", async () => {
    const upload = await storage.uploadVehicleImage({
      vehicleId: `e2e-storage-${Date.now()}`,
      file: arquivoSintetico(),
    });
    chavesCriadas.push(upload.key);

    // HeadObject com um cliente INDEPENDENTE. Perguntar ao mesmo módulo que
    // acabou de gravar provaria só que ele é coerente consigo mesmo.
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: upload.key }));

    expect(head.$metadata.httpStatusCode).toBe(200);
    expect(head.ContentLength).toBe(upload.sizeBytes);
    expect(head.ContentType).toBe("image/webp");
  }, 60_000);

  it("o backend CONFIRMA o objeto (headVehicleImage) com o mesmo tamanho", async () => {
    const upload = await storage.uploadVehicleImage({
      vehicleId: `e2e-storage-${Date.now()}`,
      file: arquivoSintetico(),
    });
    chavesCriadas.push(upload.key);

    const head = await storage.headVehicleImage(upload.key);

    expect(head.key).toBe(upload.key);
    expect(head.contentLength).toBe(upload.sizeBytes);
    expect(head.contentType).toBe("image/webp");
  }, 60_000);

  it("o backend LÊ os bytes de volta — e são os bytes gravados", async () => {
    const upload = await storage.uploadVehicleImage({
      vehicleId: `e2e-storage-${Date.now()}`,
      file: arquivoSintetico(),
    });
    chavesCriadas.push(upload.key);

    const lido = await storage.readVehicleImage(upload.key);

    expect(lido.buffer.length).toBe(upload.sizeBytes);
    expect(lido.contentType).toBe("image/webp");
    // Assinatura RIFF/WEBP: prova que voltou uma imagem, não um corpo de erro.
    expect(lido.buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(lido.buffer.subarray(8, 12).toString("ascii")).toBe("WEBP");
  }, 60_000);

  it("os metadados do anúncio sobrevivem à ida e volta", async () => {
    const upload = await storage.uploadVehicleImage({
      vehicleId: "e2e-meta-check",
      file: arquivoSintetico("foto-capa.png"),
      isCover: true,
      sortOrder: 3,
      uploadedByUserId: "42",
    });
    chavesCriadas.push(upload.key);

    const head = await storage.headVehicleImage(upload.key);

    // As chaves de metadado chegam em minúsculas no S3.
    const meta = Object.fromEntries(
      Object.entries(head.metadata).map(([k, v]) => [k.toLowerCase(), v])
    );
    expect(JSON.stringify(meta)).toContain("e2e-meta-check");
  }, 60_000);
});

describe("a referência devolvida é aceita pela publicação", () => {
  it("upload de vários arquivos devolve referências válidas para o Step 2", async () => {
    const uploads = await storage.uploadVehicleImages({
      vehicleId: `e2e-multi-${Date.now()}`,
      files: [arquivoSintetico("a.png"), arquivoSintetico("b.png")],
      uploadedByUserId: "e2e",
      coverIndex: 0,
    });
    uploads.forEach((u) => chavesCriadas.push(u.key));

    expect(uploads).toHaveLength(2);

    for (const upload of uploads) {
      const referencia = referenciaDoUpload(upload);
      expect(
        referenciaAceitaPelaPublicacao(referencia),
        `a publicação recusaria "${referencia}" — foi este o 400 do BUG-ENV-01`
      ).toBe(true);
    }
  }, 90_000);

  it("REGRESSÃO: a URL relativa do fallback de disco continua sendo recusada", async () => {
    // O que o fallback local devolvia quando o storage estava fora. Se algum
    // dia isso passar a ser aceito, a publicação volta a gravar anúncio com
    // foto que o backend não consegue confirmar.
    expect(referenciaAceitaPelaPublicacao("/uploads/ads/8b1f-abc.png")).toBe(false);
    expect(referenciaAceitaPelaPublicacao("")).toBe(false);
    expect(referenciaAceitaPelaPublicacao("uploads/ads/8b1f-abc.png")).toBe(false);
  });
});

describe("objeto inexistente continua sendo rejeitado", () => {
  it("headVehicleImage numa chave que nunca existiu falha", async () => {
    await expect(
      storage.headVehicleImage(`vehicles/nao-existe-${Date.now()}/original/2026/09/fantasma.webp`)
    ).rejects.toBeTruthy();
  }, 60_000);

  it("readVehicleImage numa chave inexistente falha", async () => {
    await expect(
      storage.readVehicleImage(`vehicles/nao-existe-${Date.now()}/original/2026/09/fantasma.webp`)
    ).rejects.toBeTruthy();
  }, 60_000);

  it("depois de remover, o objeto deixa de ser confirmável", async () => {
    // O caso mais próximo do defeito real: a referência EXISTIU, e some. Se a
    // confirmação continuasse passando aqui, um anúncio poderia apontar para
    // foto apagada.
    const upload = await storage.uploadVehicleImage({
      vehicleId: `e2e-remove-${Date.now()}`,
      file: arquivoSintetico(),
    });

    await expect(storage.headVehicleImage(upload.key)).resolves.toBeTruthy();

    await storage.removeVehicleImage(upload.key);

    await expect(storage.headVehicleImage(upload.key)).rejects.toBeTruthy();
  }, 90_000);
});

describe("validação de entrada continua valendo com storage real", () => {
  it("MIME fora da whitelist é recusado ANTES de tocar o bucket", async () => {
    const antes = await client.send(new ListObjectsV2Command({ Bucket: bucket }));

    await expect(
      storage.uploadVehicleImage({
        vehicleId: "e2e-mime",
        file: {
          buffer: Buffer.from("nao sou imagem"),
          originalname: "malicioso.txt",
          mimetype: "text/plain",
          size: 14,
        },
      })
    ).rejects.toBeTruthy();

    const depois = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
    expect(depois.KeyCount ?? 0, "arquivo recusado não pode ter sido gravado").toBe(
      antes.KeyCount ?? 0
    );
  }, 60_000);
});
