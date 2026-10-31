import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({
  getStoreProfile: vi.fn(),
  send: vi.fn(),
}));
vi.mock("../../src/modules/account/store-profile.service.js", () => ({
  getStoreProfile: mocks.getStoreProfile,
}));
vi.mock("../../src/infrastructure/storage/r2.service.js", () => ({
  getR2Config: () => ({ bucketName: "test-bucket" }),
  getR2Client: () => ({ send: mocks.send }),
}));

import { uploadStoreMedia } from "../../src/modules/account/store-media.service.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getStoreProfile.mockResolvedValue({ name: "Loja de teste" });
  mocks.send.mockResolvedValue({});
});

const mockImage = async () =>
  sharp({
    create: { width: 24, height: 18, channels: 3, background: "#202020" },
  })
    .png()
    .toBuffer();

describe("identidade pública da loja — upload no R2 do backend", () => {
  it("rejeita conta CPF e não escreve no storage ou no cadastro", async () => {
    await expect(
      uploadStoreMedia({
        userId: 123,
        accountType: "CPF",
        kind: "cover",
        file: { buffer: await mockImage(), mimetype: "image/png" },
      })
    ).rejects.toThrow(/apenas para lojistas/);
    expect(mocks.getStoreProfile).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("exige loja existente antes de enviar ao R2", async () => {
    mocks.getStoreProfile.mockRejectedValue(new Error("Loja não encontrada."));
    await expect(
      uploadStoreMedia({
        userId: 123,
        accountType: "CNPJ",
        kind: "logo",
        file: { buffer: await mockImage(), mimetype: "image/png" },
      })
    ).rejects.toThrow("Loja não encontrada.");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("aceita foto de fachada e devolve URL válida para cadastro, sem atualizar anúncios", async () => {
    const result = await uploadStoreMedia({
      userId: 122,
      accountType: "CNPJ",
      kind: "cover",
      file: { buffer: await mockImage(), mimetype: "image/png" },
    });

    const hash = crypto.createHash("sha256").update("122").digest("hex").slice(0, 20);
    const key = new URL(result.url, "https://www.carrosnacidade.com").searchParams.get("key");
    expect(key).toMatch(new RegExp("^dealers/" + hash + "/cover/[a-f0-9-]{36}\\.webp$"));
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const uploaded = mocks.send.mock.calls[0][0].input;
    expect(uploaded.Bucket).toBe("test-bucket");
    expect(uploaded.Key).toBe(key);
    expect(uploaded.ContentType).toBe("image/webp");
    const metadata = await sharp(uploaded.Body).metadata();
    expect(metadata.format).toBe("webp");
  });

  it("rejeita MIME errado, campo inválido ou arquivo vazio", async () => {
    const image = await mockImage();
    for (const test of [
      { kind: "front", file: { buffer: image, mimetype: "image/png" } },
      { kind: "cover", file: { buffer: image, mimetype: "image/heic" } },
      { kind: "cover", file: { buffer: Buffer.alloc(0), mimetype: "image/png" } },
    ]) {
      await expect(
        uploadStoreMedia({ userId: 122, accountType: "CNPJ", ...test })
      ).rejects.toThrow();
    }
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
