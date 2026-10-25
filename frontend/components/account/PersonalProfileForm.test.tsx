// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PersonalProfileForm from "./PersonalProfileForm";
import type { PersonalProfile } from "@/lib/account/backend-account";

const profile: PersonalProfile = {
  name: "Maria Exemplo",
  email: "maria@example.test",
  document: { type: "CPF", number: "12345678909", verified: true },
  phone: "11999998888",
  whatsapp: "11999998888",
  address: "Rua Teste",
  city: "Atibaia",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Dados pessoais de PF", () => {
  it("mostra os dados cadastrados e mantém identidade e cidade somente leitura", () => {
    render(<PersonalProfileForm initial={{ ...profile }} />);
    expect((screen.getByLabelText("Nome completo") as HTMLInputElement).value).toBe(
      "Maria Exemplo"
    );
    expect((screen.getByLabelText("E-mail de acesso") as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText("CPF") as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText("CPF") as HTMLInputElement).value).toBe("123.456.789-09");
    expect((screen.getByLabelText("Cidade cadastrada") as HTMLInputElement).readOnly).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Salvar alterações" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("salva exclusivamente telefone, WhatsApp e endereço pelo BFF privado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, profile: { ...profile, phone: "11988887777" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PersonalProfileForm initial={{ ...profile }} />);
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "11988887777" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/account/personal");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({
      phone: "11988887777",
      whatsapp: "11999998888",
      address: "Rua Teste",
    });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("atualizados com sucesso")
    );
    expect(
      (screen.getByRole("button", { name: "Salvar alterações" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("bloqueia telefone inválido sem enviar a solicitação", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PersonalProfileForm initial={{ ...profile }} />);
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "123" } });
    expect(screen.getByRole("alert").textContent).toContain("Verifique os telefones");
    expect(
      (screen.getByRole("button", { name: "Salvar alterações" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
