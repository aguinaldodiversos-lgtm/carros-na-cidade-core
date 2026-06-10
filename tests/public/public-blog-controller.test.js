import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/admin/blog/admin-blog.service.js", () => ({
  listPublicPosts: vi.fn(),
  getPublicPostBySlug: vi.fn(),
}));

import {
  listPublicBlogPosts,
  getPublicBlogPostBySlug,
} from "../../src/modules/public/public-blog.controller.js";
import {
  listPublicPosts,
  getPublicPostBySlug,
} from "../../src/modules/admin/blog/admin-blog.service.js";

function createRes() {
  return {
    body: null,
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public-blog.controller · listPublicBlogPosts", () => {
  it("retorna { success, data, total } com filtros repassados", async () => {
    listPublicPosts.mockResolvedValue({
      data: [{ id: 1, slug: "post-publicado", title: "Post" }],
      total: 1,
      limit: 12,
      offset: 0,
    });
    const req = { query: { category: "compra", limit: "6", offset: "12" } };
    const res = createRes();
    const next = vi.fn();

    await listPublicBlogPosts(req, res, next);

    expect(listPublicPosts).toHaveBeenCalledWith(
      expect.objectContaining({ category: "compra", limit: 6, offset: 12 })
    );
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(next).not.toHaveBeenCalled();
  });

  it("query inválida cai nos defaults (12/0)", async () => {
    listPublicPosts.mockResolvedValue({ data: [], total: 0, limit: 12, offset: 0 });
    const req = { query: { limit: "abc", offset: "-5" } };
    const res = createRes();

    await listPublicBlogPosts(req, res, vi.fn());

    expect(listPublicPosts).toHaveBeenCalledWith(expect.objectContaining({ limit: 12, offset: 0 }));
  });
});

describe("public-blog.controller · getPublicBlogPostBySlug", () => {
  it("retorna post published", async () => {
    getPublicPostBySlug.mockResolvedValue({ id: 1, slug: "post-ok", title: "OK" });
    const req = { params: { slug: "post-ok" } };
    const res = createRes();
    const next = vi.fn();

    await getPublicBlogPostBySlug(req, res, next);

    expect(res.body.success).toBe(true);
    expect(res.body.data.slug).toBe("post-ok");
    expect(next).not.toHaveBeenCalled();
  });

  it("draft/unpublished/archived/inexistente → next(404)", async () => {
    getPublicPostBySlug.mockResolvedValue(null);
    const req = { params: { slug: "rascunho-invisivel" } };
    const res = createRes();
    const next = vi.fn();

    await getPublicBlogPostBySlug(req, res, next);

    expect(res.body).toBe(null);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 404 });
  });
});
