// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompleteProfileGate from "./CompleteProfileGate";

describe("CompleteProfileGate", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("exige dados pessoais e documento valido antes de enviar", () => {
    render(<CompleteProfileGate onCompleted={vi.fn()} />);

    expect((screen.getByTestId("profile-submit") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId("profile-name"), {
      target: { value: "Ana" },
    });
    fireEvent.change(screen.getByTestId("profile-address"), {
      target: { value: "Rua Teste, 123" },
    });
    fireEvent.change(screen.getByTestId("profile-phone"), {
      target: { value: "(11) 99999-9999" },
    });
    fireEvent.change(screen.getByTestId("profile-document"), {
      target: { value: "390.533.447-05" },
    });

    expect((screen.getByTestId("profile-submit") as HTMLButtonElement).disabled).toBe(false);
  });

  it("envia perfil completo para a BFF de verificacao", async () => {
    const onCompleted = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    render(<CompleteProfileGate onCompleted={onCompleted} />);

    fireEvent.change(screen.getByTestId("profile-name"), {
      target: { value: "Ana Teste" },
    });
    fireEvent.change(screen.getByTestId("profile-address"), {
      target: { value: "Rua Teste, 123 - Centro" },
    });
    fireEvent.change(screen.getByTestId("profile-phone"), {
      target: { value: "(11) 99999-9999" },
    });
    fireEvent.change(screen.getByTestId("profile-document"), {
      target: { value: "390.533.447-05" },
    });
    fireEvent.click(screen.getByTestId("profile-submit"));

    await waitFor(() => {
      expect(onCompleted).toHaveBeenCalledTimes(1);
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/auth/verify-document",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      document_type: "cpf",
      document_number: "39053344705",
      name: "Ana Teste",
      address: "Rua Teste, 123 - Centro",
      phone: "11999999999",
      whatsapp: "11999999999",
    });
  });
});
