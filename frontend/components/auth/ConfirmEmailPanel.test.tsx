// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConfirmEmailPanel from "./ConfirmEmailPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("confirmação de e-mail", () => {
  it("não consome o token quando a página é apenas aberta ou pré-visualizada", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ConfirmEmailPanel token={"a".repeat(64)} />);
    expect(screen.getByRole("button", { name: "Confirmar meu e-mail" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("confirma exclusivamente depois do clique, por POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, message: "E-mail confirmado com sucesso." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ConfirmEmailPanel token={"a".repeat(64)} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar meu e-mail" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, req] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/verify-email");
    expect(req.method).toBe("POST");
    expect(JSON.parse(req.body as string)).toEqual({ token: "a".repeat(64) });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("sucesso"));
  });

  it("token inválido nunca chama a API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ConfirmEmailPanel token="invalido" />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmar meu e-mail" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
