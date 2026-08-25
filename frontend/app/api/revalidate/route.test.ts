import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}));

import { POST } from "./route";
import { PUBLIC_ADS_CACHE_TAG } from "@/lib/cache/public-ads-tag";

function makeReq(body: unknown, headers: Record<string, string> = {}): Parameters<typeof POST>[0] {
  return new Request("http://localhost/api/revalidate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.REVALIDATE_TOKEN = "test-secret-revalidate";
});

describe("/api/revalidate", () => {
  it("401 sem Authorization", async () => {
    const res = await POST(makeReq({ paths: ["/"] }));
    expect(res.status).toBe(401);
  });

  it("401 com Bearer errado", async () => {
    const res = await POST(makeReq({ paths: ["/"] }, { Authorization: "Bearer bad" }));
    expect(res.status).toBe(401);
  });

  it("400 sem paths nem tags", async () => {
    const res = await POST(
      makeReq({}, { Authorization: "Bearer test-secret-revalidate" })
    );
    expect(res.status).toBe(400);
  });

  it("ignora paths não-allowlisted", async () => {
    const res = await POST(
      makeReq(
        { paths: ["/random", "/"] },
        { Authorization: "Bearer test-secret-revalidate" }
      )
    );
    expect(res.status).toBe(200);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("ignora tags não-allowlisted", async () => {
    const res = await POST(
      makeReq(
        { tags: ["public-home-hero", "evil"] },
        { Authorization: "Bearer test-secret-revalidate" }
      )
    );
    expect(res.status).toBe(200);
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("public-home-hero");
  });
});

/**
 * Fase 4.10A (correção) — a tag das vitrines de anúncios.
 *
 * O backend dispara esta tag ao bloquear/reativar. Se a allowlist não a
 * aceitasse, a rota responderia 200 sem invalidar nada — uma falha silenciosa
 * que só apareceria como "o anúncio bloqueado ainda está no catálogo".
 */
describe("/api/revalidate — tag pública de anúncios", () => {
  it("aceita a tag public-ads e invalida", async () => {
    const res = await POST(
      makeReq({ tags: [PUBLIC_ADS_CACHE_TAG] }, { Authorization: "Bearer test-secret-revalidate" })
    );

    expect(res.status).toBe(200);
    expect(mocks.revalidateTag).toHaveBeenCalledWith(PUBLIC_ADS_CACHE_TAG);
    const json = await res.json();
    expect(json.revalidated.tags).toContain(PUBLIC_ADS_CACHE_TAG);
  });

  it("aceita o payload exato que o backend envia (tags + paths)", async () => {
    const res = await POST(
      makeReq(
        { tags: [PUBLIC_ADS_CACHE_TAG], paths: ["/", "/comprar"] },
        { Authorization: "Bearer test-secret-revalidate" }
      )
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.revalidated.tags).toEqual([PUBLIC_ADS_CACHE_TAG]);
    expect(json.revalidated.paths).toEqual(["/", "/comprar"]);
  });

  it("sem token não invalida a tag de anúncios", async () => {
    const res = await POST(makeReq({ tags: [PUBLIC_ADS_CACHE_TAG] }));

    expect(res.status).toBe(401);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("com token errado não invalida a tag de anúncios", async () => {
    const res = await POST(
      makeReq({ tags: [PUBLIC_ADS_CACHE_TAG] }, { Authorization: "Bearer chute" })
    );

    expect(res.status).toBe(401);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("path arbitrário continua ignorado mesmo com token válido", async () => {
    const res = await POST(
      makeReq(
        { paths: ["/admin", "/painel/anuncios", "/veiculo/qualquer-slug"] },
        { Authorization: "Bearer test-secret-revalidate" }
      )
    );

    // Nenhum deles está na allowlist: a rota não é um purge parametrizável.
    expect(res.status).toBe(200);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("a rota não exporta GET — leitura não invalida nada", async () => {
    const mod = await import("./route");
    expect((mod as Record<string, unknown>).GET).toBeUndefined();
  });
});
