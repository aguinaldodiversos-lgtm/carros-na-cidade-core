// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import StoreProfileForm from "./StoreProfileForm";
import type { StoreProfile } from "@/lib/account/backend-account";

const sample: StoreProfile = {
  name: "Loja Exemplo",
  email: "contato@loja.test",
  whatsapp: "11987654321",
  address: "Rua da Loja, 123",
  city: { id: 1, name: "Atibaia", state: "SP" },
  document: { type: "CNPJ", number: "11222333000181" },
  verified: true,
  has_contact_channel: true,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Dados da loja — selo administrativo", () => {
  it("remove a indicação de verificada quando o backend revoga por mudança de nome ou endereço", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        store: { ...sample, name: "Loja Alterada", verified: false },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StoreProfileForm initial={{ ...sample }} />);
    expect(screen.getByText("Loja verificada pela equipe do portal.")).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue(sample.name), {
      target: { value: "Loja Alterada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar dados da loja" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/account/store");
    expect(request.method).toBe("PUT");
    expect(JSON.parse(request.body as string)).not.toHaveProperty("verified");

    await waitFor(() => {
      expect(
        screen.getByText(
          "Loja cadastrada. A verificação do CNPJ e do endereço físico está pendente."
        )
      ).toBeTruthy();
    });
    expect(screen.queryByText("Loja verificada pela equipe do portal.")).toBeNull();
  });

  it("mantém o selo quando o backend preserva a verificação em alteração de contato", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, store: { ...sample, whatsapp: "11999999999" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StoreProfileForm initial={{ ...sample }} />);
    fireEvent.change(screen.getByLabelText("WhatsApp de contato"), {
      target: { value: "11999999999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar dados da loja" }));

    await waitFor(() => {
      expect(screen.getByText("Loja verificada pela equipe do portal.")).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
