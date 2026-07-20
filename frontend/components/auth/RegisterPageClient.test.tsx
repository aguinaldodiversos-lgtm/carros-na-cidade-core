// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import RegisterPageClient from "./RegisterPageClient";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/auth/client-session-reset", () => ({
  clearClientAuthArtifacts: vi.fn(),
}));

function fillValidForm() {
  fireEvent.change(screen.getByPlaceholderText("voce@exemplo.com"), {
    target: { value: "novo@teste.com" },
  });
  fireEvent.change(screen.getByPlaceholderText("Mínimo 6 caracteres"), {
    target: { value: "senha123" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("RegisterPageClient — propagação do next", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('link "Entrar" aponta para /login (rota central, nunca /entrar)', () => {
    render(<RegisterPageClient />);
    expect(screen.getByText("Entrar").getAttribute("href")).toBe("/login");
  });

  it("envia o next no corpo do cadastro", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ redirect_to: "/anunciar/novo?tipo=particular" }),
    } as Response);

    render(<RegisterPageClient next="/anunciar/novo?tipo=particular" />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init?.body as string).next).toBe("/anunciar/novo?tipo=particular");
  });

  // PARTE 3: e-mail já existente não pode fazer o usuário perder o destino.
  it("preserva o next após cadastro falho (2ª tentativa ainda envia o destino)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "E-mail já cadastrado." }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ redirect_to: "/anunciar/novo?tipo=lojista" }),
      } as Response);

    render(<RegisterPageClient next="/anunciar/novo?tipo=lojista" />);

    // 1ª tentativa → erro (e-mail já existe).
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await waitFor(() => expect(screen.getByRole("status")).toBeDefined());

    // 2ª tentativa: o next NÃO foi perdido.
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    const [, secondInit] = fetchSpy.mock.calls[1];
    expect(JSON.parse(secondInit?.body as string).next).toBe("/anunciar/novo?tipo=lojista");
  });
});
