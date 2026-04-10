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
});
