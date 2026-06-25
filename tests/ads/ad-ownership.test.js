import { describe, it, expect } from "vitest";
import {
  AD_STATUS_OWNER_EDITABLE,
  assertAdOwner,
  assertCanEditAd,
  canUserEditAd,
  canUserOwnAd,
  isAdminUser,
} from "../../src/modules/ads/ad-ownership.js";

/**
 * Autorização central de edição. O vínculo de dono é IGUAL para PF e
 * lojista/CNPJ: ads.advertiser_id → advertisers.user_id (exposto como
 * `advertiser_user_id` no ownerContext). Por isso os testes de PF e de
 * lojista exercitam o mesmo caminho — o que prova que não há regra divergente
 * entre os dois tipos de conta (a causa raiz reportada não era de plano).
 */
describe("ad-ownership.canUserEditAd", () => {
  const OWNER = { id: "user-1", role: "user" };

  it("admin: ignora ownership e status", () => {
    const verdict = canUserEditAd(
      { id: "admin-1", role: "admin" },
      { advertiser_user_id: "outro", status: "blocked" }
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("admin");
  });

  it("dono pessoa física de anúncio active: permitido", () => {
    const verdict = canUserEditAd(OWNER, {
      advertiser_user_id: "user-1",
      status: "active",
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("owner");
  });

  it("dono lojista/CNPJ de anúncio active: permitido (mesmo vínculo advertiser_user_id)", () => {
    // Conta CNPJ resolve ownership pela MESMA coluna (advertisers.user_id).
    const verdict = canUserEditAd(
      { id: "loja-1", role: "user", account_type: "CNPJ" },
      { advertiser_user_id: "loja-1", status: "active" }
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("owner");
  });

  it.each(["draft", "pending_review", "active", "paused", "rejected"])(
    "dono em status editável '%s': permitido",
    (status) => {
      const verdict = canUserEditAd(OWNER, { advertiser_user_id: "user-1", status });
      expect(verdict.allowed).toBe(true);
    }
  );

  it.each(["sold", "expired", "archived", "blocked", "deleted"])(
    "dono em status bloqueado '%s': 409",
    (status) => {
      const verdict = canUserEditAd(OWNER, { advertiser_user_id: "user-1", status });
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toBe("status_locked");
      expect(verdict.httpStatus).toBe(409);
      expect(verdict.status).toBe(status);
    }
  );

  it("terceiro (não dono): 403", () => {
    const verdict = canUserEditAd(OWNER, {
      advertiser_user_id: "outro-user",
      status: "active",
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("forbidden");
    expect(verdict.httpStatus).toBe(403);
  });

  it("ownerContext inexistente: 404", () => {
    const verdict = canUserEditAd(OWNER, null);
    expect(verdict.allowed).toBe(false);
    expect(verdict.httpStatus).toBe(404);
  });

  it("advertiser_user_id nulo (sem dono resolvido): 404", () => {
    const verdict = canUserEditAd(OWNER, { advertiser_user_id: null, status: "active" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.httpStatus).toBe(404);
  });

  it("comparação de id é por string (BIGSERIAL vs string da sessão)", () => {
    const verdict = canUserEditAd(
      { id: 42, role: "user" },
      { advertiser_user_id: "42", status: "active" }
    );
    expect(verdict.allowed).toBe(true);
  });
});

describe("ad-ownership.assertCanEditAd", () => {
  it("não dono → AppError 403", () => {
    let err;
    try {
      assertCanEditAd({ id: "a" }, { advertiser_user_id: "b", status: "active" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(403);
  });

  it("status bloqueado → AppError 409 com code AD_STATUS_NOT_EDITABLE", () => {
    let err;
    try {
      assertCanEditAd({ id: "a" }, { advertiser_user_id: "a", status: "sold" });
    } catch (e) {
      err = e;
    }
    expect(err.statusCode).toBe(409);
    expect(err.details?.code).toBe("AD_STATUS_NOT_EDITABLE");
    expect(err.details?.status).toBe("sold");
  });

  it("inexistente → AppError 404", () => {
    let err;
    try {
      assertCanEditAd({ id: "a" }, null);
    } catch (e) {
      err = e;
    }
    expect(err.statusCode).toBe(404);
  });

  it("dono em active → não lança", () => {
    expect(() =>
      assertCanEditAd({ id: "a" }, { advertiser_user_id: "a", status: "active" })
    ).not.toThrow();
  });
});

describe("ad-ownership.assertAdOwner (somente ownership, sem status)", () => {
  it("dono de anúncio sold: permitido (status NÃO é checado aqui)", () => {
    const verdict = canUserOwnAd({ id: "a" }, { advertiser_user_id: "a", status: "sold" });
    expect(verdict.allowed).toBe(true);
    expect(() =>
      assertAdOwner({ id: "a" }, { advertiser_user_id: "a", status: "sold" })
    ).not.toThrow();
  });

  it("terceiro → 403", () => {
    let err;
    try {
      assertAdOwner({ id: "a" }, { advertiser_user_id: "b", status: "active" });
    } catch (e) {
      err = e;
    }
    expect(err.statusCode).toBe(403);
  });
});

describe("ad-ownership helpers", () => {
  it("isAdminUser reconhece role admin (case-insensitive)", () => {
    expect(isAdminUser({ role: "admin" })).toBe(true);
    expect(isAdminUser({ role: "ADMIN" })).toBe(true);
    expect(isAdminUser({ role: "user" })).toBe(false);
    expect(isAdminUser(null)).toBe(false);
  });

  it("AD_STATUS_OWNER_EDITABLE não inclui estados encerrados/punição", () => {
    expect(AD_STATUS_OWNER_EDITABLE).not.toContain("sold");
    expect(AD_STATUS_OWNER_EDITABLE).not.toContain("archived");
    expect(AD_STATUS_OWNER_EDITABLE).not.toContain("blocked");
    expect(AD_STATUS_OWNER_EDITABLE).toContain("active");
  });
});
