// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import LoginForm from "./LoginForm";

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

describe("LoginForm", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("renders email and password fields", () => {
    render(<LoginForm />);
    expect(screen.getByPlaceholderText("voce@exemplo.com")).toBeDefined();
    expect(screen.getByPlaceholderText("******")).toBeDefined();
  });

  it("renders submit button", () => {
    render(<LoginForm />);
    expect(screen.getByRole("button", { name: "Entrar" })).toBeDefined();
  });

  it("renders links to recover password and register", () => {
    render(<LoginForm />);
    expect(screen.getByText("Esqueci minha senha")).toBeDefined();
    expect(screen.getByText("Criar conta")).toBeDefined();
  });

  it('link "Criar conta" é /cadastro puro quando não há next', () => {
    render(<LoginForm />);
    expect(screen.getByText("Criar conta").getAttribute("href")).toBe("/cadastro");
  });

  it('link "Criar conta" PROPAGA o next para o cadastro (anunciante novo cai no form)', () => {
    render(<LoginForm next="/anunciar/novo?tipo=lojista" />);
    expect(screen.getByText("Criar conta").getAttribute("href")).toBe(
      `/cadastro?next=${encodeURIComponent("/anunciar/novo?tipo=lojista")}`
    );
  });

  it("shows error on failed login (401)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Credenciais invalidas" }),
    } as Response);

    render(<LoginForm />);

    fireEvent.change(screen.getByPlaceholderText("voce@exemplo.com"), {
      target: { value: "user@test.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("******"), {
      target: { value: "wrongpassword" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(screen.getByText("Credenciais invalidas")).toBeDefined();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("redirects on successful login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ redirect_to: "/dashboard" }),
    } as Response);

    render(<LoginForm />);

    fireEvent.change(screen.getByPlaceholderText("voce@exemplo.com"), {
      target: { value: "user@test.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("******"), {
      target: { value: "correctpassword" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard");
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("sends next param in request body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ redirect_to: "/comprar" }),
    } as Response);

    render(<LoginForm next="/comprar" />);

    fireEvent.change(screen.getByPlaceholderText("voce@exemplo.com"), {
      target: { value: "user@test.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("******"), {
      target: { value: "pass123" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.next).toBe("/comprar");
  });

  it("shows connection error on fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    render(<LoginForm />);

    fireEvent.change(screen.getByPlaceholderText("voce@exemplo.com"), {
      target: { value: "user@test.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("******"), {
      target: { value: "pass123" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(screen.getByText(/Falha na conexao/)).toBeDefined();
    });
  });

  // PARTE 3: senha errada não pode fazer o usuário perder o destino.
  it("preserva o next após login falho (2ª tentativa ainda envia o destino)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Credenciais invalidas" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ redirect_to: "/anunciar/novo?tipo=lojista" }),
      } as Response);

    render(<LoginForm next="/anunciar/novo?tipo=lojista" />);

    const email = screen.getByPlaceholderText("voce@exemplo.com");
    const password = screen.getByPlaceholderText("******");
    const submit = screen.getByRole("button", { name: "Entrar" });

    // 1ª tentativa: senha errada → 401.
    fireEvent.change(email, { target: { value: "user@test.com" } });
    fireEvent.change(password, { target: { value: "errada" } });
    fireEvent.submit(submit);
    await waitFor(() => expect(screen.getByTestId("login-error")).toBeDefined());

    // O link "Criar conta" continua carregando o destino.
    expect(screen.getByText("Criar conta").getAttribute("href")).toBe(
      `/cadastro?next=${encodeURIComponent("/anunciar/novo?tipo=lojista")}`
    );

    // 2ª tentativa: o next NÃO foi perdido.
    fireEvent.change(password, { target: { value: "certa123" } });
    fireEvent.submit(submit);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    const [, secondInit] = fetchSpy.mock.calls[1];
    expect(JSON.parse(secondInit?.body as string).next).toBe("/anunciar/novo?tipo=lojista");
  });
});
