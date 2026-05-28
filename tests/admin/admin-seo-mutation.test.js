import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do repositório e do audit ANTES de importar o service.
vi.mock("../../src/modules/admin/seo/admin-seo.repository.js", () => ({
  findPublicationById: vi.fn(),
  updatePublication: vi.fn(),
  findPublicationAudits: vi.fn(),
  findAdminActionHistory: vi.fn(),
}));

vi.mock("../../src/modules/admin/admin.audit.js", () => ({
  recordAdminAction: vi.fn(),
}));

import * as repo from "../../src/modules/admin/seo/admin-seo.repository.js";
import { recordAdminAction } from "../../src/modules/admin/admin.audit.js";
import { updatePublication } from "../../src/modules/admin/seo/admin-seo.service.js";

const ADMIN_ID = "admin-123";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updatePublication — derivação de action em admin_actions", () => {
  it("is_indexable=false → action mark_seo_noindex, target_id correto, reason preservado", async () => {
    repo.findPublicationById.mockResolvedValueOnce({ id: 3, path: "/x", is_indexable: true });
    repo.updatePublication.mockResolvedValueOnce({ id: 3, path: "/x", is_indexable: false });

    await updatePublication(ADMIN_ID, 3, { is_indexable: false }, "motivo noindex");

    expect(repo.updatePublication).toHaveBeenCalledWith(3, { is_indexable: false });
    expect(recordAdminAction).toHaveBeenCalledTimes(1);
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_ID,
        action: "mark_seo_noindex",
        targetType: "seo_publication",
        targetId: 3,
        oldValue: { is_indexable: true },
        newValue: { is_indexable: false },
        reason: "motivo noindex",
      })
    );
  });

  it("is_indexable=true → action mark_seo_indexable (revert), target_id e reason corretos", async () => {
    repo.findPublicationById.mockResolvedValueOnce({ id: 3, path: "/x", is_indexable: false });
    repo.updatePublication.mockResolvedValueOnce({ id: 3, path: "/x", is_indexable: true });

    await updatePublication(ADMIN_ID, 3, { is_indexable: true }, "Revert validação Fase 3.1");

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mark_seo_indexable",
        targetType: "seo_publication",
        targetId: 3,
        oldValue: { is_indexable: false },
        newValue: { is_indexable: true },
        reason: "Revert validação Fase 3.1",
      })
    );
  });

  it("a action depende do VALOR enviado, não do estado anterior", async () => {
    // Estado anterior true, envia true de novo → no diff → no-op, sem action.
    repo.findPublicationById.mockResolvedValueOnce({ id: 5, path: "/y", is_indexable: true });

    const result = await updatePublication(ADMIN_ID, 5, { is_indexable: true }, "sem mudança");

    expect(repo.updatePublication).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 5, is_indexable: true });
  });

  it("reason obrigatório para mudar is_indexable — rejeita sem reason", async () => {
    repo.findPublicationById.mockResolvedValueOnce({ id: 3, path: "/x", is_indexable: true });

    await expect(updatePublication(ADMIN_ID, 3, { is_indexable: false }, "")).rejects.toThrow(
      /Motivo.*obrigat/i
    );
    expect(repo.updatePublication).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("404 quando publicação não existe", async () => {
    repo.findPublicationById.mockResolvedValueOnce(null);
    await expect(
      updatePublication(ADMIN_ID, 999, { is_indexable: false }, "x")
    ).rejects.toThrow(/não encontrada/i);
  });

  it("dois toggles consecutivos no mesmo id geram noindex e depois indexable", async () => {
    // 1. noindex
    repo.findPublicationById.mockResolvedValueOnce({ id: 3, is_indexable: true, path: "/x" });
    repo.updatePublication.mockResolvedValueOnce({ id: 3, is_indexable: false, path: "/x" });
    await updatePublication(ADMIN_ID, 3, { is_indexable: false }, "noindex");

    // 2. revert
    repo.findPublicationById.mockResolvedValueOnce({ id: 3, is_indexable: false, path: "/x" });
    repo.updatePublication.mockResolvedValueOnce({ id: 3, is_indexable: true, path: "/x" });
    await updatePublication(ADMIN_ID, 3, { is_indexable: true }, "revert");

    const actions = recordAdminAction.mock.calls.map((c) => c[0].action);
    expect(actions).toEqual(["mark_seo_noindex", "mark_seo_indexable"]);
    const targets = recordAdminAction.mock.calls.map((c) => c[0].targetId);
    expect(targets).toEqual([3, 3]);
  });
});
