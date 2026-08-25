// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import AdsPremiumList from "./AdsPremiumList";
import type { DashboardAd } from "@/lib/dashboard-types";

/**
 * Fase 4.10A — a tabela "Meus anúncios" com um anúncio bloqueado.
 *
 * Esta lista é a segunda superfície do dono (a outra é o card do dashboard).
 * O ponto crítico é o mesmo: o anúncio aparece, mas sem oferecer ação que o
 * dono não pode executar. Antes desta fase o anúncio nem chegava aqui — a
 * query do painel não incluía `blocked` — então o dono via o anúncio evaporar.
 */

afterEach(cleanup);

const ACTIVE: DashboardAd = {
  id: "10",
  user_id: "user-1",
  title: "Toyota Corolla 2021",
  price: 119900,
  image_url: "/images/vehicle-placeholder.svg",
  status: "active",
  is_featured: false,
  featured_until: null,
  priority_level: "normal",
  views: 30,
  leads: 4,
  expires_at: "2026-12-01T00:00:00.000Z",
};

const BLOCKED: DashboardAd = {
  ...ACTIVE,
  id: "42",
  title: "Honda Civic 2020",
  status: "blocked",
  moderation: {
    rejection_reason: null,
    correction_requested_reason: null,
    blocked_reason_code: "invalid_photos",
    blocked_at: "2026-08-25T13:32:00.000Z",
    blocked_message: "As fotos do anúncio precisam ser revisadas.",
  },
};

function renderList(ads: DashboardAd[]) {
  const onBoost = vi.fn();
  const onToggleStatus = vi.fn();
  const utils = render(
    <AdsPremiumList
      ads={ads}
      busyAdId={null}
      variant="pf"
      onBoost={onBoost}
      onToggleStatus={onToggleStatus}
    />
  );
  return { ...utils, onBoost, onToggleStatus };
}

describe("anúncio bloqueado na lista do dono", () => {
  it("aparece na lista (não some do painel)", () => {
    renderList([BLOCKED]);
    expect(screen.getByText(/Honda Civic/)).toBeTruthy();
  });

  it("mostra o badge Bloqueado", () => {
    renderList([BLOCKED]);
    expect(screen.getByTestId("ad-status-blocked-42")).toBeTruthy();
  });

  it("mostra o motivo no rótulo do anunciante", () => {
    renderList([BLOCKED]);
    expect(screen.getByTestId("ad-blocked-message-42").textContent).toMatch(
      /As fotos do anúncio precisam ser revisadas\./
    );
  });

  it("explica que corrigir não reativa", () => {
    renderList([BLOCKED]);
    expect(screen.getByTestId("ad-blocked-support-42").textContent).toMatch(
      /continuará bloqueado até ser reativado pela administração/i
    );
  });

  it("oferece Editar — é a correção que a moderação está pedindo", () => {
    renderList([BLOCKED]);

    const edit = screen.getByTestId("ad-blocked-edit-42");
    expect(edit).toBeTruthy();
    expect(edit.getAttribute("href")).toBe("/painel/anuncios/42/editar");
  });

  it("NÃO oferece Impulsionar nem o menu de Ativar/Pausar", () => {
    renderList([BLOCKED]);

    // Editar corrige; Impulsionar e Ativar PUBLICAM. Só o admin publica.
    expect(screen.queryByRole("button", { name: /impulsionar/i })).toBeNull();
    expect(screen.queryByTestId("ad-kebab-42")).toBeNull();
    expect(screen.queryByRole("button", { name: /ativar anúncio/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /pausar anúncio/i })).toBeNull();
  });

  it("não mostra selo de destaque em anúncio bloqueado", () => {
    const { container } = renderList([{ ...BLOCKED, is_featured: true }]);
    expect(container.textContent).not.toMatch(/Destaque/);
  });

  it("não vaza o código cru do motivo", () => {
    const { container } = renderList([BLOCKED]);
    expect(container.textContent).not.toMatch(/invalid_photos/);
  });
});

describe("anúncio ativo continua com todas as ações", () => {
  it("mantém Impulsionar, Editar e o menu de status", () => {
    renderList([ACTIVE]);

    expect(screen.getByRole("button", { name: /impulsionar/i })).toBeTruthy();
    expect(screen.getByTestId("ad-kebab-10")).toBeTruthy();
  });

  it("um bloqueado ao lado de um ativo não afeta as ações do ativo", () => {
    renderList([ACTIVE, BLOCKED]);

    // O ativo mantém o kebab; o bloqueado não tem.
    expect(screen.getByTestId("ad-kebab-10")).toBeTruthy();
    expect(screen.queryByTestId("ad-kebab-42")).toBeNull();
  });
});
