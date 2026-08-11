import { describe, expect, it } from "vitest";
import {
  formatBadgeCount,
  formatRelativeTime,
  isSafeInternalPath,
  NOTIFICATION_BADGE_MAX,
} from "./api";

/**
 * `isSafeInternalPath` é a SEGUNDA barreira contra open redirect — o backend já
 * valida `action_path` na escrita. Ela existe porque o dado pode ter sido
 * gravado antes de uma regra mudar, e porque o custo de recusar um caminho
 * estranho é só "não navega", enquanto o de aceitar é levar um usuário logado
 * para fora do portal a partir de um clique que ele confia.
 */
describe("isSafeInternalPath — aceita apenas rota interna das áreas privadas", () => {
  const accepted = [
    "/dashboard",
    "/dashboard/minhas-procuras",
    "/dashboard/minhas-procuras/123",
    "/dashboard-loja",
    "/dashboard-loja/oportunidades/9",
    "/dashboard/meus-anuncios?tab=ativos",
    "/dashboard-loja#topo",
  ];

  for (const path of accepted) {
    it(`aceita ${path}`, () => {
      expect(isSafeInternalPath(path)).toBe(true);
    });
  }
});

describe("isSafeInternalPath — recusa qualquer destino externo ou fora da área", () => {
  const rejected = [
    "https://evil.com",
    "http://evil.com",
    "//evil.com",
    "javascript:alert(1)",
    "data:text/html,x",
    "/\\evil.com",
    "\\\\evil.com",
    "/%5Cevil.com",
    "/dashboard/../admin",
    "/dashboard/..",
    "/admin",
    "/login",
    "/comprar",
    "/",
    // Prefixo solto: "/dashboard" não pode liberar "/dashboard*"
    "/dashboardevil",
    "/dashboard-evil",
    "/dashboard-loja-evil",
    "",
    null,
    undefined,
  ];

  for (const path of rejected) {
    it(`recusa ${JSON.stringify(path)}`, () => {
      expect(isSafeInternalPath(path as string)).toBe(false);
    });
  }
});

describe("formatBadgeCount", () => {
  it("mostra o número exato até o teto", () => {
    expect(formatBadgeCount(1)).toBe("1");
    expect(formatBadgeCount(2)).toBe("2");
    expect(formatBadgeCount(NOTIFICATION_BADGE_MAX)).toBe("99");
  });

  it("acima do teto vira 99+", () => {
    expect(formatBadgeCount(NOTIFICATION_BADGE_MAX + 1)).toBe("99+");
    expect(formatBadgeCount(1000)).toBe("99+");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");

  it("minutos, horas e dias", () => {
    expect(formatRelativeTime("2026-08-10T11:57:00.000Z", now)).toBe("Há 3 min");
    expect(formatRelativeTime("2026-08-10T09:00:00.000Z", now)).toBe("Há 3 h");
    expect(formatRelativeTime("2026-08-09T12:00:00.000Z", now)).toBe("Ontem");
    expect(formatRelativeTime("2026-08-07T12:00:00.000Z", now)).toBe("Há 3 dias");
  });

  it("agora mesmo", () => {
    expect(formatRelativeTime("2026-08-10T11:59:40.000Z", now)).toBe("Agora");
  });

  it("data inválida não quebra (string vazia)", () => {
    expect(formatRelativeTime("não-é-data", now)).toBe("");
  });
});
