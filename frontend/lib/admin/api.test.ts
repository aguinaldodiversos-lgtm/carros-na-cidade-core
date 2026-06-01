import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { adminApi, extractAdminApiErrorMessage } from "./api";

const fetchSpy = vi.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  fetchSpy.mockReset();
  global.fetch = fetchSpy as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("extractAdminApiErrorMessage — nunca renderiza boolean", () => {
  it("ignora error:true e usa message", () => {
    const msg = extractAdminApiErrorMessage(
      { success: false, error: true, message: "Motivo (reason) é obrigatório." },
      400
    );
    expect(msg).toBe("Motivo (reason) é obrigatório.");
  });

  it("usa error string quando message ausente", () => {
    const msg = extractAdminApiErrorMessage({ success: false, error: "not_found" }, 404);
    expect(msg).toBe("not_found");
  });

  it("ignora error:true e cai no fallback se nada útil", () => {
    const msg = extractAdminApiErrorMessage({ success: false, error: true }, 500);
    expect(msg).toBe("Erro 500");
  });

  it("aceita string vazia como ausente (cai no fallback)", () => {
    const msg = extractAdminApiErrorMessage(
      { success: false, error: "", message: "   " },
      400
    );
    expect(msg).toBe("Erro 400");
  });

  it("payload nulo → fallback com status", () => {
    expect(extractAdminApiErrorMessage(null, 503)).toBe("Erro 503");
    expect(extractAdminApiErrorMessage(undefined, 502)).toBe("Erro 502");
  });

  it("usa details.message quando message ausente no topo", () => {
    const msg = extractAdminApiErrorMessage(
      { success: false, error: true, details: { message: "image_alt obrigatório" } },
      400
    );
    expect(msg).toBe("image_alt obrigatório");
  });
});

describe("adminApi.home.updateBanner — regressão do bug 'true'", () => {
  it("backend retornando { error: true, message } → erro do client tem message humana, NUNCA 'true'", async () => {
    // Reproduz exatamente o payload que o backend Express devolve em 400.
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: true,
        message: "image_alt é obrigatório quando há imagem desktop configurada.",
      }),
    });

    await expect(
      adminApi.home.updateBanner(2, { title: "X" }, "publicidade")
    ).rejects.toThrowError("image_alt é obrigatório quando há imagem desktop configurada.");
    // Sanity: NUNCA o boolean stringificado.
    await expect(
      adminApi.home.updateBanner(2, { title: "X" }, "publicidade")
    ).rejects.not.toThrowError("true");
  });

  it("upload com 400 do backend retorna mensagem humana", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: true,
        message: "Formato não suportado: image/gif.",
      }),
    });
    const file = new File([new Uint8Array([1])], "x.gif", { type: "image/gif" });
    await expect(adminApi.home.uploadImage(2, file, "desktop")).rejects.toThrowError(
      "Formato não suportado: image/gif."
    );
  });

  it("sucesso atravessa intacto (sem perder data)", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          id: 2,
          key: "home_hero_2",
          section_type: "home_hero",
          position: 2,
          title: "Anuncie seu veículo grátis",
          is_active: true,
          version: 5,
          created_at: "",
          updated_at: "",
          updated_by_admin_id: null,
          subtitle: null,
          cta_label: "Anunciar grátis",
          cta_url: "/anunciar",
          image_desktop_url: null,
          image_mobile_url: null,
          image_alt: null,
        },
      }),
    });
    const res = await adminApi.home.updateBanner(2, { title: "X" }, "publicidade");
    expect(res.data.position).toBe(2);
    expect(res.data.title).toBe("Anuncie seu veículo grátis");
  });

  it("usa o endpoint correto da position", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: {} }),
    });
    await adminApi.home.updateBanner(2, { title: "T" }, "r");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/admin/home/hero/2",
      expect.objectContaining({ method: "PATCH" })
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ title: "T", reason: "r" });
  });
});

