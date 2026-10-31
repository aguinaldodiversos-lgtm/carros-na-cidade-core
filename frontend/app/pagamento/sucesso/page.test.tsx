// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import PagamentoSucessoPage from "./page";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => <a href={href} {...props}>{children}</a>,
}));

const ID = "56dbb539-7df7-488a-937b-6aee8f56b6a9";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("tela de confirmação do pagamento", () => {
  it("mostra sucesso somente após resposta aprovada do backend com destaque ativo", async () => {
    window.history.replaceState({}, "", "/pagamento/sucesso?external_reference=" + ID + "&status=approved");
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ context: "boost", status: "approved", boost_active: true }),
    });
    vi.stubGlobal("fetch", spy);

    render(<PagamentoSucessoPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Pagamento confirmado!" })).toBeTruthy();
    });
    expect(screen.getByText(/Destaque de 7 dias está ativo/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Voltar ao painel da loja/i }).getAttribute("href")).toBe("/dashboard-loja");
    expect(screen.queryByText("Retomar meu anúncio")).toBeNull();
    expect(spy).toHaveBeenCalledWith(
      "/api/payments/return-status?reference=" + ID,
      expect.objectContaining({ method: "GET", cache: "no-store" })
    );
  });

  it("não confia em status=approved enviado na URL sem referência de pagamento", async () => {
    window.history.replaceState({}, "", "/pagamento/sucesso?status=approved");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    render(<PagamentoSucessoPage />);
    await waitFor(() => {
      expect(screen.getByText("Não foi possível confirmar o pagamento")).toBeTruthy();
    });
    expect(screen.queryByText("Pagamento confirmado!")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("não chama aprovado quando o backend devolve rejeitado", async () => {
    window.history.replaceState({}, "", "/pagamento/sucesso?external_reference=" + ID + "&status=approved");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ context: "boost", status: "rejected", boost_active: false }),
      })
    );
    render(<PagamentoSucessoPage />);
    await waitFor(() => {
      expect(screen.getByText("Pagamento não confirmado")).toBeTruthy();
    });
    expect(screen.queryByText("Pagamento confirmado!")).toBeNull();
  });
});
