// Upload de fotos: namespace, teto por requisição e tradução de erro.
//
// O upload ao R2 é INJETADO. O que está sob teste é a política — quem pode
// enviar, quantas, sob qual prefixo e o que acontece quando o pipeline recusa o
// arquivo. Bater no R2 de verdade tornaria o teste dependente de rede e de
// credenciais, e não provaria nada além do SDK da Amazon.

import { describe, expect, it, vi } from "vitest";

import { uploadSaleRequestPhotos } from "../../src/modules/sale-requests/sale-requests.photos.service.js";
import { SALE_REQUEST_PHOTOS } from "../../src/modules/sale-requests/sale-requests.constants.js";
import {
  SALE_REQUEST_KEY_PREFIX,
  generateSaleRequestImageKey,
} from "../../src/infrastructure/storage/r2.service.js";
import {
  ImageInputError,
  ObjectStorageError,
} from "../../src/infrastructure/storage/storage-errors.js";

const OWNER = { id: "7", account_type: "CPF" };

function fakeFiles(count) {
  return Array.from({ length: count }, (_, index) => ({
    originalname: `foto-${index}.jpg`,
    mimetype: "image/jpeg",
    size: 1024,
    buffer: Buffer.from("x"),
  }));
}

/** Upload de mentira que devolve a chave que o gerador REAL produziria. */
function fakeUpload() {
  return vi.fn().mockImplementation(async ({ ownerUserId, uploadSessionId, file, sortOrder }) => {
    const key = generateSaleRequestImageKey({
      ownerUserId,
      uploadSessionId,
      originalName: file.originalname,
      mimeType: "image/webp",
    });
    return { key, publicUrl: "", sortOrder };
  });
}

describe("namespace das chaves", () => {
  it("toda chave cai debaixo de sale-requests/{ownerUserId}/", async () => {
    const upload = fakeUpload();
    const result = await uploadSaleRequestPhotos(OWNER, fakeFiles(4), {
      uploadSaleRequestImage: upload,
    });

    expect(result.images).toHaveLength(4);
    for (const image of result.images) {
      expect(image.storage_key.startsWith(`${SALE_REQUEST_KEY_PREFIX}/${OWNER.id}/`)).toBe(true);
    }
  });

  it("o id do dono vem da SESSÃO, nunca do cliente", async () => {
    const upload = fakeUpload();
    // Não existe parâmetro por onde o cliente influencie o destino: a função só
    // recebe `user` e os arquivos.
    await uploadSaleRequestPhotos(OWNER, fakeFiles(1), { uploadSaleRequestImage: upload });

    for (const call of upload.mock.calls) {
      expect(call[0].ownerUserId).toBe(OWNER.id);
    }
  });

  it("o uploadSessionId é gerado no servidor e é o MESMO para o lote", async () => {
    const upload = fakeUpload();
    await uploadSaleRequestPhotos(OWNER, fakeFiles(3), { uploadSaleRequestImage: upload });

    const sessions = new Set(upload.mock.calls.map((call) => call[0].uploadSessionId));
    expect(sessions.size).toBe(1);
    // UUID v4, não algo previsível ou vindo de fora.
    expect([...sessions][0]).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("lotes distintos usam sessões distintas", async () => {
    const upload = fakeUpload();
    await uploadSaleRequestPhotos(OWNER, fakeFiles(1), { uploadSaleRequestImage: upload });
    await uploadSaleRequestPhotos(OWNER, fakeFiles(1), { uploadSaleRequestImage: upload });

    const sessions = new Set(upload.mock.calls.map((call) => call[0].uploadSessionId));
    expect(sessions.size).toBe(2);
  });

  it("cada foto recebe sort_order pela posição no lote", async () => {
    const upload = fakeUpload();
    await uploadSaleRequestPhotos(OWNER, fakeFiles(3), { uploadSaleRequestImage: upload });

    expect(upload.mock.calls.map((call) => call[0].sortOrder)).toEqual([0, 1, 2]);
  });
});

describe("quantidade", () => {
  it("recusa lote vazio", async () => {
    await expect(
      uploadSaleRequestPhotos(OWNER, [], { uploadSaleRequestImage: fakeUpload() })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("aceita exatamente o teto", async () => {
    const result = await uploadSaleRequestPhotos(OWNER, fakeFiles(SALE_REQUEST_PHOTOS.MAX), {
      uploadSaleRequestImage: fakeUpload(),
    });
    expect(result.images).toHaveLength(SALE_REQUEST_PHOTOS.MAX);
  });

  it("recusa acima do teto por requisição", async () => {
    await expect(
      uploadSaleRequestPhotos(OWNER, fakeFiles(SALE_REQUEST_PHOTOS.MAX + 1), {
        uploadSaleRequestImage: fakeUpload(),
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("NÃO aplica o piso de 4 — enviar em duas levas é fluxo legítimo", async () => {
    // Quem exige o mínimo é a criação, onde a regra realmente vale.
    const result = await uploadSaleRequestPhotos(OWNER, fakeFiles(2), {
      uploadSaleRequestImage: fakeUpload(),
    });
    expect(result.images).toHaveLength(2);
  });
});

describe("sessão", () => {
  it("recusa usuário sem id", async () => {
    await expect(
      uploadSaleRequestPhotos({ id: "" }, fakeFiles(1), {
        uploadSaleRequestImage: fakeUpload(),
      })
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ERRO DO ARQUIVO × ERRO DO STORAGE
// ────────────────────────────────────────────────────────────────────────────
// O bug que estes testes travam: no smoke da Fase 4.1 o R2 respondeu
// "The specified bucket does not exist" e o usuário recebeu 400 com "Use JPG,
// PNG ou WebP de até 10 MB" — mandado converter uma foto que estava perfeita.
//
// Os mocks lançam os erros TIPADOS que `uploadSaleRequestImage` de fato lança.
// Não usam `new Error("...bucket...")`, porque classificar por texto é
// justamente o que a correção evita: o teste passaria a validar a string do SDK
// da AWS em vez do contrato do produto.

describe("erro de INPUT — o arquivo é o problema", () => {
  it.each([
    ["MIME não permitido", "[r2] Tipo de arquivo não permitido: image/heic."],
    ["arquivo vazio", "[r2] Arquivo inválido ou vazio."],
    ["arquivo acima do limite", "[r2] Arquivo excede o limite permitido (20000000 > 10485760)."],
    ["imagem corrompida", "[normalizer] Buffer de entrada vazio."],
  ])("%s → 400 INVALID_PHOTO", async (_label, message) => {
    const upload = vi.fn().mockRejectedValue(new ImageInputError(message));

    await expect(
      uploadSaleRequestPhotos(OWNER, fakeFiles(1), { uploadSaleRequestImage: upload })
    ).rejects.toMatchObject({
      statusCode: 400,
      details: { code: "SALE_REQUEST_INVALID_PHOTO", field: "photos", index: 0 },
    });
  });

  it("erro de input NÃO devolve a mensagem de storage", async () => {
    const upload = vi.fn().mockRejectedValue(new ImageInputError("[r2] Arquivo vazio."));

    await expect(
      uploadSaleRequestPhotos(OWNER, fakeFiles(1), { uploadSaleRequestImage: upload })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Use JPG, PNG ou WebP/i),
    });
  });

  it("mensagem marcada como `expose` chega ao usuário", async () => {
    // É a mensagem que explica onde desligar o "alta eficiência" no iPhone.
    // Trocá-la pelo texto genérico tornaria o erro menos acionável.
    const upload = vi.fn().mockRejectedValue(
      new ImageInputError("Esta foto está em HEIC, formato que ainda não processamos.", {
        expose: true,
      })
    );

    await expect(
      uploadSaleRequestPhotos(OWNER, fakeFiles(1), { uploadSaleRequestImage: upload })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/HEIC/),
    });
  });

  it("uma foto ruim no meio do lote interrompe o lote inteiro", async () => {
    // Aceitar parcialmente deixaria o formulário com uma galeria diferente da que
    // a pessoa escolheu, sem ela saber qual foto faltou.
    let call = 0;
    const upload = vi.fn().mockImplementation(async () => {
      call += 1;
      if (call === 2) throw new ImageInputError("[r2] Arquivo excede o limite permitido");
      return { key: `${SALE_REQUEST_KEY_PREFIX}/7/s/2026/08/a.webp`, publicUrl: "" };
    });

    await expect(
      uploadSaleRequestPhotos(OWNER, fakeFiles(3), { uploadSaleRequestImage: upload })
    ).rejects.toMatchObject({
      statusCode: 400,
      details: { index: 1 },
    });

    expect(upload).toHaveBeenCalledTimes(2);
  });
});

describe("erro de STORAGE — a foto não tem defeito", () => {
  it.each([
    ["configuração ausente", "config", "[r2] Variável obrigatória ausente: R2_BUCKET_NAME"],
    ["bucket inexistente", "put", "The specified bucket does not exist"],
    ["credencial recusada", "put", "AccessDenied"],
    ["assinatura inválida", "put", "SignatureDoesNotMatch"],
    ["conexão recusada", "put", "connect ECONNREFUSED 127.0.0.1:9000"],
    ["timeout", "put", "Connection timed out"],
  ])("%s → 503 STORAGE_UNAVAILABLE", async (_label, stage, causeMessage) => {
    const cause = new Error(causeMessage);
    const upload = vi
      .fn()
      .mockRejectedValue(new ObjectStorageError("falha de storage", { cause, stage }));

    await expect(
      uploadSaleRequestPhotos(OWNER, fakeFiles(1), { uploadSaleRequestImage: upload })
    ).rejects.toMatchObject({
      statusCode: 503,
      details: { code: "SALE_REQUEST_PHOTO_STORAGE_UNAVAILABLE", field: "photos" },
    });
  });

  it("a mensagem pública é segura e não culpa a foto", async () => {
    const cause = new Error("The specified bucket does not exist");
    cause.name = "NoSuchBucket";
    const upload = vi
      .fn()
      .mockRejectedValue(new ObjectStorageError("falha ao gravar", { cause, stage: "put" }));

    const failure = await uploadSaleRequestPhotos(OWNER, fakeFiles(1), {
      uploadSaleRequestImage: upload,
    }).catch((error) => error);

    expect(failure.message).toBe(
      "Não foi possível enviar a foto agora. Tente novamente em instantes."
    );

    // Nada da infraestrutura pode aparecer na resposta.
    const serialized = JSON.stringify({
      message: failure.message,
      details: failure.details,
    });
    for (const leak of [
      /bucket/i,
      /R2_/,
      /endpoint/i,
      /account/i,
      /access.?key/i,
      /secret/i,
      /NoSuchBucket/,
      /amazonaws|cloudflarestorage/i,
    ]) {
      expect(serialized).not.toMatch(leak);
    }

    // E não pode sugerir que o arquivo estava errado.
    expect(failure.message).not.toMatch(/JPG|PNG|WebP|10 MB|formato/i);
    expect(failure.details.code).not.toBe("SALE_REQUEST_INVALID_PHOTO");
  });

  it("storage no meio do lote também para o lote", async () => {
    let call = 0;
    const upload = vi.fn().mockImplementation(async () => {
      call += 1;
      if (call === 2) {
        throw new ObjectStorageError("falha ao gravar", {
          cause: new Error("NoSuchBucket"),
          stage: "put",
        });
      }
      return { key: `${SALE_REQUEST_KEY_PREFIX}/7/s/2026/08/a.webp`, publicUrl: "" };
    });

    await expect(
      uploadSaleRequestPhotos(OWNER, fakeFiles(3), { uploadSaleRequestImage: upload })
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(upload).toHaveBeenCalledTimes(2);
  });
});

describe("erro NÃO CLASSIFICADO — não inventar defeito na foto", () => {
  it("erro cru é repassado, nunca convertido em INVALID_PHOTO", async () => {
    // Um `TypeError` é bug nosso. Transformá-lo em "sua foto é inválida" manda o
    // usuário caçar um problema que não existe — foi exatamente essa conversão
    // genérica que produziu o bug do smoke.
    const bug = new TypeError("client.send is not a function");
    const upload = vi.fn().mockRejectedValue(bug);

    const failure = await uploadSaleRequestPhotos(OWNER, fakeFiles(1), {
      uploadSaleRequestImage: upload,
    }).catch((error) => error);

    expect(failure).toBe(bug);
    expect(failure.details?.code).toBeUndefined();
    expect(failure.statusCode).toBeUndefined();
  });
});

describe("gerador de chave", () => {
  it("recusa ownerUserId vazio", () => {
    expect(() =>
      generateSaleRequestImageKey({
        ownerUserId: "",
        uploadSessionId: "s",
        originalName: "a.jpg",
        mimeType: "image/webp",
      })
    ).toThrowError(/ownerUserId/);
  });

  it("recusa uploadSessionId vazio", () => {
    expect(() =>
      generateSaleRequestImageKey({
        ownerUserId: "7",
        uploadSessionId: "",
        originalName: "a.jpg",
        mimeType: "image/webp",
      })
    ).toThrowError(/uploadSessionId/);
  });

  it("neutraliza tentativa de traversal no id da sessão", () => {
    // Ainda que a sessão seja gerada no servidor hoje, o gerador não pode
    // depender disso: `sanitizePathSegment` achata qualquer separador.
    const key = generateSaleRequestImageKey({
      ownerUserId: "7",
      uploadSessionId: "../../999",
      originalName: "a.jpg",
      mimeType: "image/webp",
    });

    expect(key).not.toContain("..");
    expect(key.startsWith(`${SALE_REQUEST_KEY_PREFIX}/7/`)).toBe(true);
  });

  it("a extensão acompanha o formato NORMALIZADO (webp)", () => {
    const key = generateSaleRequestImageKey({
      ownerUserId: "7",
      uploadSessionId: "s",
      originalName: "foto.HEIC",
      mimeType: "image/webp",
    });
    expect(key.endsWith(".webp")).toBe(true);
  });
});
