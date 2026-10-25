import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/modules/admin/advertisers/admin-advertisers.repository.js", () => ({
  findById: vi.fn(),
  setVerification: vi.fn(),
}));
vi.mock("../../src/modules/admin/admin.audit.js", () => ({ recordAdminAction: vi.fn() }));
import * as repo from "../../src/modules/admin/advertisers/admin-advertisers.repository.js";
import { recordAdminAction } from "../../src/modules/admin/admin.audit.js";
import { updateAdvertiserVerification } from "../../src/modules/admin/advertisers/admin-advertisers.service.js";

const shop = {
  id: 44,
  document_type: "cnpj",
  document_number: "11222333000181",
  name: "Loja do Centro",
  address: "Rua Principal 78",
  city_id: 12,
  verified: false,
};
const approved = {
  verified: true,
  checked_receita: true,
  checked_physical_store: true,
  reason: "CNPJ ativo na Receita; endereço comercial conferido em visita.",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findById).mockResolvedValue({ ...shop });
  vi.mocked(repo.setVerification).mockResolvedValue({ id: 44, verified: true });
});

describe("verificação manual da loja", () => {
  it("exige conferência oficial e da loja física, com justificativa", async () => {
    for (const patch of [
      { checked_receita: false },
      { checked_physical_store: false },
      { reason: "ok" },
    ]) {
      await expect(
        updateAdvertiserVerification("admin-1", 44, { ...approved, ...patch })
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(repo.setVerification).not.toHaveBeenCalled();
  });

  it("não aceita CNPJ inválido ou conta CPF", async () => {
    vi.mocked(repo.findById).mockResolvedValueOnce({
      ...shop,
      document_number: "11222333000182",
    });
    await expect(updateAdvertiserVerification("admin-1", 44, approved)).rejects.toMatchObject({
      statusCode: 422,
    });
    vi.mocked(repo.findById).mockResolvedValueOnce({
      ...shop,
      document_type: "cpf",
    });
    await expect(updateAdvertiserVerification("admin-1", 44, approved)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(repo.setVerification).not.toHaveBeenCalled();
  });

  it("registra o administrador, as duas confirmações e a justificativa", async () => {
    const result = await updateAdvertiserVerification("admin-1", 44, approved);
    expect(result.verified).toBe(true);
    expect(repo.setVerification).toHaveBeenCalledWith(44, true);
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "verify_physical_store",
        targetType: "advertiser",
        targetId: 44,
        reason: approved.reason,
        newValue: expect.objectContaining({
          checked_receita: true,
          checked_physical_store: true,
        }),
      })
    );
  });

  it("permite revogar verificação com justificativa e registra auditoria", async () => {
    vi.mocked(repo.findById).mockResolvedValueOnce({ ...shop, verified: true });
    vi.mocked(repo.setVerification).mockResolvedValueOnce({ id: 44, verified: false });
    const result = await updateAdvertiserVerification("admin-1", 44, {
      verified: false,
      reason: "Endereço comercial mudou e exige nova vistoria.",
    });
    expect(result.verified).toBe(false);
    expect(repo.setVerification).toHaveBeenCalledWith(44, false);
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "revoke_physical_store_verification",
      })
    );
  });
});
