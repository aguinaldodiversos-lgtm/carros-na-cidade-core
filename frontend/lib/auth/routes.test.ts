import { describe, it, expect } from "vitest";
import { AUTH_ROUTES, loginWithNext } from "./routes";

describe("AUTH_ROUTES", () => {
  it("aponta para as rotas reais (nunca /entrar)", () => {
    expect(AUTH_ROUTES.login).toBe("/login");
    expect(AUTH_ROUTES.register).toBe("/cadastro");
    expect(AUTH_ROUTES.recoverPassword).toBe("/recuperar-senha");
    // Trava anti-regressão do bug do /entrar.
    expect(Object.values(AUTH_ROUTES)).not.toContain("/entrar");
  });
});

describe("loginWithNext", () => {
  it("monta /login com o next encodado", () => {
    expect(loginWithNext("/anunciar/novo?tipo=lojista")).toBe(
      `/login?next=${encodeURIComponent("/anunciar/novo?tipo=lojista")}`
    );
  });

  it("sempre começa pela rota real de login", () => {
    expect(loginWithNext("/x")).toContain(`${AUTH_ROUTES.login}?next=`);
  });
});
