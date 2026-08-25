// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import AdCard from "./AdCard";
import type { DashboardAd } from "@/lib/dashboard-types";

/**
 * Fase 4.10A — o que o ANUNCIANTE vê quando seu anúncio é bloqueado.
 *
 * Antes desta fase o anúncio bloqueado sumia do painel sem explicação. Agora
 * ele aparece, com motivo e caminho de suporte — e sem nenhum botão que
 * prometa uma reversão que o dono não pode executar.
 *
 * Duas coisas NÃO podem aparecer aqui: a nota administrativa interna e a
 * identidade de quem bloqueou. Nenhuma das duas chega neste payload.
 */

afterEach(cleanup);

const BASE: DashboardAd = {
  id: "42",
  user_id: "user-1",
  title: "Honda Civic 2020",
  price: 89900,
  image_url: "/images/vehicle-placeholder.svg",
  status: "active",
  is_featured: false,
  featured_until: null,
  priority_level: "normal",
  views: 10,
  leads: 2,
  expires_at: "2026-12-01T00:00:00.000Z",
};

const BLOCKED: DashboardAd = {
  ...BASE,
  status: "blocked",
  moderation: {
    rejection_reason: null,
    correction_requested_reason: null,
    blocked_reason_code: "suspected_fraud",
    blocked_at: "2026-08-25T13:32:00.000Z",
    blocked_message: "Informações do anúncio precisam ser verificadas.",
  },
};

function renderCard(ad: DashboardAd) {
  const onToggleStatus = vi.fn();
  const onDelete = vi.fn();
  const utils = render(<AdCard ad={ad} onToggleStatus={onToggleStatus} onDelete={onDelete} />);
  return { ...utils, onToggleStatus, onDelete };
}

describe("anúncio bloqueado — o que o dono lê", () => {
  it("mostra o aviso de bloqueio administrativo", () => {
    renderCard(BLOCKED);
    expect(screen.getByTestId("ad-blocked-notice-42")).toBeTruthy();
    expect(
      screen.getByText(/temporariamente bloqueado pela administração do Carros na Cidade/i)
    ).toBeTruthy();
  });

  it("mostra o motivo no rótulo destinado ao anunciante", () => {
    renderCard(BLOCKED);
    expect(screen.getByText(/Informações do anúncio precisam ser verificadas\./)).toBeTruthy();
  });

  it("aponta o suporte como caminho", () => {
    renderCard(BLOCKED);
    expect(screen.getByText(/Entre em contato com o suporte/i)).toBeTruthy();
  });

  it("o badge diz Bloqueado, não Pausado", () => {
    const { container } = renderCard(BLOCKED);
    expect(container.textContent).toMatch(/Bloqueado/);
    expect(container.textContent).not.toMatch(/Pausado/);
  });

  it("uma suspeita de fraude não é imputada ao dono", () => {
    const { container } = renderCard(BLOCKED);
    // O admin registrou "Possível fraude"; o dono lê "precisam ser verificadas".
    expect(container.textContent).not.toMatch(/fraude/i);
  });

  it("não vaza o código cru do motivo", () => {
    const { container } = renderCard(BLOCKED);
    expect(container.textContent).not.toMatch(/suspected_fraud/);
  });
});

describe("anúncio bloqueado — o que o dono NÃO pode fazer", () => {
  it("não oferece o botão Ativar", () => {
    renderCard(BLOCKED);
    expect(screen.queryByRole("button", { name: /^Ativar$/ })).toBeNull();
  });

  it("o botão de status fica desabilitado e rotulado Bloqueado", () => {
    renderCard(BLOCKED);
    const btn = screen.getByRole("button", { name: /Bloqueado/ });
    expect(btn).toHaveProperty("disabled", true);
  });

  it("clicar no botão de status não dispara mudança nenhuma", () => {
    const { onToggleStatus } = renderCard(BLOCKED);
    fireEvent.click(screen.getByRole("button", { name: /Bloqueado/ }));
    expect(onToggleStatus).not.toHaveBeenCalled();
  });

  it("explica por que a ação está indisponível", () => {
    renderCard(BLOCKED);
    const btn = screen.getByRole("button", { name: /Bloqueado/ });
    expect(btn.getAttribute("title")).toMatch(/só podem ser reativados pelo suporte/i);
  });
});

describe("reativado — o estado normal volta", () => {
  it("sem bloqueio, o botão Pausar volta a funcionar", () => {
    const { onToggleStatus } = renderCard(BASE);

    expect(screen.queryByTestId("ad-blocked-notice-42")).toBeNull();
    const btn = screen.getByRole("button", { name: /^Pausar$/ });
    expect(btn).toHaveProperty("disabled", false);

    fireEvent.click(btn);
    expect(onToggleStatus).toHaveBeenCalledTimes(1);
  });

  it("restaurado como pausado, o dono pode ativar de novo", () => {
    const { onToggleStatus } = renderCard({ ...BASE, status: "paused" });

    const btn = screen.getByRole("button", { name: /^Ativar$/ });
    expect(btn).toHaveProperty("disabled", false);

    fireEvent.click(btn);
    expect(onToggleStatus).toHaveBeenCalledTimes(1);
  });
});
