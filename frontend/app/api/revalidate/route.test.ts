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
