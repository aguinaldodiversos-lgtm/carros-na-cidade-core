/**
 * O caminho `direct-r2` NÃO pode aceitar HEIC/HEIF/AVIF.
 *
 * Este caminho é a estratégia PRIMÁRIA do wizard (`upload-wizard-photos-
 * pipeline`) e, ao contrário do backend, ele NÃO normaliza: não importa sharp
 * e sobe o arquivo para o R2 exatamente como chegou, com a extensão original.
 *
 * Até 2026-07-29 ele aceitava `image/heic`, `image/heif` e `image/avif`. Se
 * tivesse sucesso com um desses, o anúncio publicaria com uma foto que nenhum
 * navegador além do Safari renderiza — quebrada, e SEM erro nenhum. Silencioso
 * é pior que o HTTP 500 visível que originou a correção.
 *
 * Não há lógica de bloqueio dedicada: a rejeição vem de o formato estar fora
 * de `ALLOWED_IMAGE_MIME_TYPES`, e o pipeline então cai no `backend-proxy`,
 * que normaliza. Este teste existe para travar exatamente isso — é fácil
 * alguém "consertar" o upload de iPhone reintroduzindo heic aqui.
 */
import { describe, expect, it } from "vitest";

import { validateVehicleImageFile } from "@/infrastructure/storage/r2.service.js";

function fakeFile(mimetype: string) {
  return {
    mimetype,
    originalname: `foto.${mimetype.split("/")[1]}`,
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    size: 6,
  };
}

describe("direct-r2 — formatos que sobem CRUS para o R2", () => {
  it.each(["image/heic", "image/heif", "image/avif"])(
    "rejeita %s (subiria sem normalização e quebraria o anúncio)",
    (mime) => {
      expect(() => validateVehicleImageFile(fakeFile(mime))).toThrow(/não permitido/i);
    }
  );

  it.each(["image/jpeg", "image/png", "image/webp"])(
    "aceita %s — formato que todo navegador exibe",
    (mime) => {
      expect(() => validateVehicleImageFile(fakeFile(mime))).not.toThrow();
    }
  );

  /**
   * O HEIC precisa cair no `backend-proxy` para ser tratado lá (hoje com 415
   * legível; na etapa 2, convertido). Se voltasse a ser aceito aqui, o
   * pipeline nem chegaria ao backend — o upload "daria certo" com foto morta.
   */
  it("a rejeição é o que empurra HEIC para o backend-proxy", () => {
    let mensagem = "";
    try {
      validateVehicleImageFile(fakeFile("image/heic"));
    } catch (error) {
      mensagem = error instanceof Error ? error.message : String(error);
    }

    expect(mensagem).toBeTruthy();

    // A mensagem ECOA o tipo rejeitado ("não permitido: image/heic") — isso é
    // correto e útil. O que não pode é heic/heif/avif aparecer na lista de
    // PERMITIDOS, que é o trecho após "Permitidos:".
    const permitidos = mensagem.split("Permitidos:")[1] ?? "";
    expect(permitidos).toBeTruthy();
    expect(permitidos).not.toMatch(/heic|heif|avif/i);
    expect(permitidos).toMatch(/image\/jpeg/);
  });
});
