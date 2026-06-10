import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/admin/blog/admin-blog.repository.js", () => ({
  listPosts: vi.fn(),
  findById: vi.fn(),
  findBySlug: vi.fn(),
  insertPost: vi.fn(),
  updateById: vi.fn(),
  listPublishedPosts: vi.fn(),
  findPublishedBySlug: vi.fn(),
}));

vi.mock("../../src/modules/admin/admin.audit.js", () => ({
  recordAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/infrastructure/storage/r2.service.js", () => ({
  uploadSiteImage: vi.fn(),
}));

import {
  slugify,
  estimateReadingMinutes,
  createPost,
  updatePost,
  publishPost,
  unpublishPost,
  archivePost,
  restorePost,
  listPublicPosts,
  getPublicPostBySlug,
  uploadCoverImage,
} from "../../src/modules/admin/blog/admin-blog.service.js";
import {
  findById,
  findBySlug,
  insertPost,
  updateById,
  listPublishedPosts,
  findPublishedBySlug,
} from "../../src/modules/admin/blog/admin-blog.repository.js";
import { recordAdminAction } from "../../src/modules/admin/admin.audit.js";
import { uploadSiteImage } from "../../src/infrastructure/storage/r2.service.js";

const ADMIN_ID = "admin-1";

/** Post completo e publicável (draft). */
function draftRow(overrides = {}) {
  return {
    id: 10,
    title: "Como comprar um carro usado com segurança",
    slug: "como-comprar-carro-usado-com-seguranca",
    excerpt: "Veja cuidados essenciais antes de negociar um veículo usado.",
    content: "x".repeat(400),
    cover_image_url: null,
    cover_image_alt: null,
    category: "compra",
    tags: ["usados"],
    author_id: ADMIN_ID,
    status: "draft",
    published_at: null,
    archived_at: null,
    meta_title: null,
    meta_description: null,
    canonical_url: null,
    og_image_url: null,
    is_indexable: true,
    reading_time_minutes: 2,
    version: 1,
    created_at: "2026-06-10T00:00:00Z",
    updated_at: "2026-06-10T00:00:00Z",
    updated_by_admin_id: ADMIN_ID,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ───────────────────────────────────────────────────────────────────────────
// Helpers puros
// ───────────────────────────────────────────────────────────────────────────

describe("admin-blog.service · slugify", () => {
  it("remove acentos, baixa caixa e troca separadores por hífen", () => {
    expect(slugify("Como comprar um carro usado com segurança?")).toBe(
      "como-comprar-um-carro-usado-com-seguranca"
    );
    expect(slugify("Revisão & Manutenção — Águas de São Pedro")).toBe(
      "revisao-manutencao-aguas-de-sao-pedro"
    );
  });

  it("colapsa hífens e remove pontas", () => {
    expect(slugify("  --Olá--mundo--  ")).toBe("ola-mundo");
  });
});

describe("admin-blog.service · estimateReadingMinutes", () => {
  it("usa ~200 palavras/min com mínimo 1", () => {
    expect(estimateReadingMinutes("uma frase curta")).toBe(1);
    expect(estimateReadingMinutes("palavra ".repeat(450))).toBe(3);
    expect(estimateReadingMinutes("")).toBe(null);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// createPost
// ───────────────────────────────────────────────────────────────────────────

describe("admin-blog.service · createPost", () => {
  it("cria draft com slug derivado do título e registra auditoria", async () => {
    findBySlug.mockResolvedValue(null);
    insertPost.mockImplementation(async (fields) => draftRow(fields));

    const dto = await createPost({
      adminUserId: ADMIN_ID,
      payload: { title: "Como comprar um carro usado com segurança" },
    });

    expect(insertPost).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Como comprar um carro usado com segurança",
        slug: "como-comprar-um-carro-usado-com-seguranca",
        status: "draft",
        author_id: ADMIN_ID,
      })
    );
    expect(dto.status).toBe("draft");
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create_blog_post",
        targetType: "blog_post",
      })
    );
  });

  it("rejeita título com menos de 5 caracteres", async () => {
    await expect(
      createPost({ adminUserId: ADMIN_ID, payload: { title: "Oi" } })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(insertPost).not.toHaveBeenCalled();
  });

  it("slug duplicado → 409", async () => {
    findBySlug.mockResolvedValue(draftRow());
    await expect(
      createPost({
        adminUserId: ADMIN_ID,
        payload: { title: "Como comprar um carro usado com segurança" },
      })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(insertPost).not.toHaveBeenCalled();
  });

  it("calcula reading_time_minutes quando há content", async () => {
    findBySlug.mockResolvedValue(null);
    insertPost.mockImplementation(async (fields) => draftRow(fields));

    await createPost({
      adminUserId: ADMIN_ID,
      payload: { title: "Título válido", content: "palavra ".repeat(450) },
    });

    expect(insertPost).toHaveBeenCalledWith(expect.objectContaining({ reading_time_minutes: 3 }));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// updatePost
// ───────────────────────────────────────────────────────────────────────────

describe("admin-blog.service · updatePost", () => {
  it("404 quando post não existe", async () => {
    findById.mockResolvedValue(null);
    await expect(
      updatePost({ adminUserId: ADMIN_ID, id: 999, payload: { title: "Novo título" } })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejeita alteração de status via PATCH", async () => {
    await expect(
      updatePost({ adminUserId: ADMIN_ID, id: 10, payload: { status: "published" } })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("atualiza campos válidos e registra auditoria update_blog_post", async () => {
    const before = draftRow();
    findById.mockResolvedValue(before);
    updateById.mockImplementation(async (_id, fields) => ({ ...before, ...fields, version: 2 }));

    const dto = await updatePost({
      adminUserId: ADMIN_ID,
      id: 10,
      payload: { title: "Título atualizado do post", excerpt: "Novo resumo." },
    });

    expect(updateById).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ title: "Título atualizado do post", excerpt: "Novo resumo." }),
      ADMIN_ID
    );
    expect(dto.version).toBe(2);
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "update_blog_post", targetId: "10" })
    );
  });

  it("capa sem alt → 400", async () => {
    findById.mockResolvedValue(draftRow());
    await expect(
      updatePost({
        adminUserId: ADMIN_ID,
        id: 10,
        payload: { cover_image_url: "https://cdn.example.com/capa.webp" },
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("renomear slug para um já usado → 409", async () => {
    findById.mockResolvedValue(draftRow());
    findBySlug.mockResolvedValue(draftRow({ id: 99, slug: "slug-ocupado" }));
    await expect(
      updatePost({ adminUserId: ADMIN_ID, id: 10, payload: { slug: "slug-ocupado" } })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("post published não pode perder o excerpt (estado final inválido)", async () => {
    findById.mockResolvedValue(draftRow({ status: "published", published_at: "2026-06-01" }));
    await expect(
      updatePost({ adminUserId: ADMIN_ID, id: 10, payload: { excerpt: null } })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("bloqueia link markdown com esquema perigoso no content", async () => {
    findById.mockResolvedValue(draftRow());
    await expect(
      updatePost({
        adminUserId: ADMIN_ID,
        id: 10,
        payload: { content: `${"x".repeat(300)} [clique](javascript:alert(1))` },
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Transições de status
// ───────────────────────────────────────────────────────────────────────────

describe("admin-blog.service · publishPost", () => {
  it("publica draft completo, preenche published_at e audita com reason", async () => {
    const before = draftRow();
    findById.mockResolvedValue(before);
    updateById.mockImplementation(async (_id, fields) => ({ ...before, ...fields, version: 2 }));

    const dto = await publishPost({ adminUserId: ADMIN_ID, id: 10, reason: "Lançamento" });

    expect(updateById).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ status: "published", archived_at: null }),
      ADMIN_ID
    );
    const updates = updateById.mock.calls[0][1];
    expect(updates.published_at).toBeInstanceOf(Date);
    expect(dto.status).toBe("published");
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "publish_blog_post", reason: "Lançamento" })
    );
  });

  it("preserva published_at original ao republicar (unpublished → published)", async () => {
    const original = "2026-05-01T10:00:00Z";
    const before = draftRow({ status: "unpublished", published_at: original });
    findById.mockResolvedValue(before);
    updateById.mockImplementation(async (_id, fields) => ({ ...before, ...fields }));

    await publishPost({ adminUserId: ADMIN_ID, id: 10, reason: "Republicação" });

    expect(updateById.mock.calls[0][1].published_at).toBe(original);
  });

  it("sem reason → 400", async () => {
    findById.mockResolvedValue(draftRow());
    await expect(publishPost({ adminUserId: ADMIN_ID, id: 10 })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(updateById).not.toHaveBeenCalled();
  });

  it("draft incompleto (sem excerpt/content) → 400 e não publica", async () => {
    findById.mockResolvedValue(draftRow({ excerpt: null, content: "curto" }));
    await expect(
      publishPost({ adminUserId: ADMIN_ID, id: 10, reason: "tentativa" })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(updateById).not.toHaveBeenCalled();
  });

  it("post archived não publica direto (precisa restaurar)", async () => {
    findById.mockResolvedValue(draftRow({ status: "archived" }));
    await expect(
      publishPost({ adminUserId: ADMIN_ID, id: 10, reason: "tentativa" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin-blog.service · unpublishPost", () => {
  it("despublica post published e audita", async () => {
    const before = draftRow({ status: "published", published_at: "2026-06-01" });
    findById.mockResolvedValue(before);
    updateById.mockImplementation(async (_id, fields) => ({ ...before, ...fields }));

    const dto = await unpublishPost({ adminUserId: ADMIN_ID, id: 10, reason: "Revisão" });

    expect(dto.status).toBe("unpublished");
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "unpublish_blog_post", reason: "Revisão" })
    );
  });

  it("draft não pode ser despublicado", async () => {
    findById.mockResolvedValue(draftRow());
    await expect(
      unpublishPost({ adminUserId: ADMIN_ID, id: 10, reason: "x" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin-blog.service · archivePost / restorePost", () => {
  it("arquiva preenchendo archived_at", async () => {
    const before = draftRow({ status: "published", published_at: "2026-06-01" });
    findById.mockResolvedValue(before);
    updateById.mockImplementation(async (_id, fields) => ({ ...before, ...fields }));

    const dto = await archivePost({ adminUserId: ADMIN_ID, id: 10, reason: "Conteúdo antigo" });

    expect(dto.status).toBe("archived");
    expect(updateById.mock.calls[0][1].archived_at).toBeInstanceOf(Date);
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "archive_blog_post" })
    );
  });

  it("restaura archived → draft por padrão e limpa archived_at", async () => {
    const before = draftRow({ status: "archived", archived_at: "2026-06-05" });
    findById.mockResolvedValue(before);
    updateById.mockImplementation(async (_id, fields) => ({ ...before, ...fields }));

    const dto = await restorePost({ adminUserId: ADMIN_ID, id: 10, reason: "Voltar a editar" });

    expect(dto.status).toBe("draft");
    expect(updateById.mock.calls[0][1].archived_at).toBe(null);
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "restore_blog_post" })
    );
  });

  it("restore só funciona em archived", async () => {
    findById.mockResolvedValue(draftRow());
    await expect(restorePost({ adminUserId: ADMIN_ID, id: 10, reason: "x" })).rejects.toMatchObject(
      { statusCode: 400 }
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Upload de capa
// ───────────────────────────────────────────────────────────────────────────

describe("admin-blog.service · uploadCoverImage", () => {
  it("sobe para R2 (section=blog, variant=cover) e devolve URL pública", async () => {
    findById.mockResolvedValue(draftRow());
    uploadSiteImage.mockResolvedValue({
      publicUrl: "https://pub.r2.dev/site/blog/cover/2026/06/uuid.webp",
      key: "site/blog/cover/2026/06/uuid.webp",
      sizeBytes: 12345,
      mimeType: "image/webp",
    });

    const out = await uploadCoverImage({
      adminUserId: ADMIN_ID,
      id: 10,
      file: { buffer: Buffer.from("x"), mimetype: "image/jpeg" },
    });

    expect(uploadSiteImage).toHaveBeenCalledWith(
      expect.objectContaining({ section: "blog", variant: "cover" })
    );
    expect(out.url).toContain("https://pub.r2.dev/");
  });

  it("sem arquivo → 400", async () => {
    findById.mockResolvedValue(draftRow());
    await expect(
      uploadCoverImage({ adminUserId: ADMIN_ID, id: 10, file: null })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Público
// ───────────────────────────────────────────────────────────────────────────

describe("admin-blog.service · público", () => {
  it("listPublicPosts delega para listPublishedPosts (WHERE published no SQL)", async () => {
    listPublishedPosts.mockResolvedValue({
      data: [draftRow({ status: "published", published_at: "2026-06-01" })],
      total: 1,
      limit: 12,
      offset: 0,
    });

    const result = await listPublicPosts({ category: "compra" });

    expect(listPublishedPosts).toHaveBeenCalledWith(
      expect.objectContaining({ category: "compra" })
    );
    expect(result.total).toBe(1);
    // DTO público não vaza campos administrativos.
    expect(result.data[0]).not.toHaveProperty("author_id");
    expect(result.data[0]).not.toHaveProperty("updated_by_admin_id");
    expect(result.data[0]).not.toHaveProperty("version");
  });

  it("categoria desconhecida → lista vazia sem tocar o banco", async () => {
    const result = await listPublicPosts({ category: "nao-existe" });
    expect(result.data).toEqual([]);
    expect(listPublishedPosts).not.toHaveBeenCalled();
  });

  it("getPublicPostBySlug retorna null para não-published (controller vira 404)", async () => {
    findPublishedBySlug.mockResolvedValue(null);
    const out = await getPublicPostBySlug("rascunho-secreto");
    expect(out).toBe(null);
  });
});
