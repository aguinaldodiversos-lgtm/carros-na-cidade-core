// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AdCard from "./AdCard";
import type { DashboardAd } from "@/lib/dashboard-types";

/**
 * Tarefa 5 — DOM do dashboard do anunciante.
 *
 * Cobre:
 *   • pending_review aparece como "Em análise"
 *   • rejected aparece como "Rejeitado"
 *   • Impulsionar fica bloqueado fora de active
 *   • Pausar/Ativar fica bloqueado em pending_review/rejected
 *   • Banner de moderação aparece com mensagem
 *   • Status "active" mantém UI normal (botões habilitados)
 */

afterEach(() => {
  cleanup();
});

function makeAd(overrides: Partial<DashboardAd> = {}): DashboardAd {
  return {
    id: "ad-1",
    user_id: "u-1",
    title: "Honda Civic 2018",
    price: 80000,
    image_url: "/images/vehicle-placeholder.svg",
    status: "active",
    is_featured: false,
    featured_until: null,
    priority_level: "normal",
    views: 12,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

const noop = () => {};

describe("AdCard — badges e bloqueios por status", () => {
  it("ACTIVE: badge 'Ativo', Pausar habilitado, Impulsionar é link", () => {
    render(
      <AdCard
        ad={makeAd({ status: "active" })}
        onToggleStatus={noop}
        onDelete={noop}
      />
    );
    // Badge: "Ativo" aparece no header card. Status section também mostra "Ativo".
    expect(screen.getAllByText(/ativo/i).length).toBeGreaterThan(0);

    const pause = screen.getByRole("button", { name: /pausar/i });
    expect(pause).toBeEnabled();

    // Impulsionar é <Link href="..."> quando active — não é <button>.
    const boost = screen.getByRole("link", { name: /impulsionar/i });
    expect(boost).toBeInTheDocument();
    expect(boost.getAttribute("href")).toContain("/impulsionar/");
  });

  it("PENDING_REVIEW: badge 'Em análise', botão Pausar bloqueado, Impulsionar bloqueado", () => {
    render(
      <AdCard
        ad={makeAd({ status: "pending_review" })}
        onToggleStatus={noop}
        onDelete={noop}
      />
    );
    expect(screen.getAllByText(/em análise/i).length).toBeGreaterThan(0);

    // Banner de moderação visível
    expect(
      screen.getByText(/análise de segurança/i)
    ).toBeInTheDocument();

    // O botão de status mostra "Aguardando" e está disabled.
    const statusButton = screen.getByRole("button", { name: /aguardando/i });
    expect(statusButton).toBeDisabled();

    // Impulsionar agora é <button disabled>, não link.
    const boostBtn = screen.getByRole("button", { name: /impulsionar/i });
    expect(boostBtn).toBeDisabled();
    expect(screen.queryByRole("link", { name: /impulsionar/i })).toBeNull();
  });

  it("REJECTED: badge 'Rejeitado', mensagem explicativa, ações bloqueadas", () => {
    render(
      <AdCard
        ad={makeAd({ status: "rejected" })}
        onToggleStatus={noop}
        onDelete={noop}
      />
    );
    expect(screen.getAllByText(/rejeitado/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/não foi possível publicar/i)
    ).toBeInTheDocument();

    const statusBtn = screen.getByRole("button", { name: /aguardando/i });
    expect(statusBtn).toBeDisabled();

    expect(screen.queryByRole("link", { name: /impulsionar/i })).toBeNull();
    const boostBtn = screen.getByRole("button", { name: /impulsionar/i });
    expect(boostBtn).toBeDisabled();
  });

  it("PAUSED: badge 'Pausado', botão 'Ativar' habilitado, Impulsionar bloqueado (não é ACTIVE)", () => {
    render(
      <AdCard
        ad={makeAd({ status: "paused" })}
        onToggleStatus={noop}
        onDelete={noop}
      />
    );
    expect(screen.getAllByText(/pausado/i).length).toBeGreaterThan(0);

    const ativar = screen.getByRole("button", { name: /ativar/i });
    expect(ativar).toBeEnabled();

    expect(screen.queryByRole("link", { name: /impulsionar/i })).toBeNull();
  });

  it("Destaque NÃO aparece quando status != ACTIVE (mesmo com is_featured=true)", () => {
    render(
      <AdCard
        ad={makeAd({ status: "pending_review", is_featured: true })}
        onToggleStatus={noop}
        onDelete={noop}
      />
    );
    // Badge 'Em análise' tem prioridade sobre 'Destaque' por design — usuário
    // não deve ver "Destaque" para um anúncio que não está ativo.
    expect(screen.queryByText(/^Destaque$/)).toBeNull();
    expect(screen.getAllByText(/em análise/i).length).toBeGreaterThan(0);
  });
});
