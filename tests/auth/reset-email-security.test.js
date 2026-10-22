import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const { sendResetPasswordEmail } = await import("../../src/services/email.service.js");

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_unit_test_only");
  vi.stubEnv("FRONTEND_URL", "https://www.carrosnacidade.com");
  vi.stubEnv("NODE_ENV", "production");
  sendMock.mockReset().mockResolvedValue({ data: { id: "fake-email-id" }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reset email — envio simulado, sem rede", () => {
  it("envia o link HTTPS correto com token para a página de recuperação", async () => {
    expect(await sendResetPasswordEmail("qa@example.test", "secret-reset-token")).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0];
    expect(payload.to).toBe("qa@example.test");
    expect(payload.from).toContain("carrosnacidade.com");
    expect(payload.html).toContain(
      "https://www.carrosnacidade.com/recuperar-senha?token=secret-reset-token"
    );
    expect(payload.html).not.toContain("/reset-password?");
  });

  it("não declara envio quando o provedor rejeita o e-mail", async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "rejected" } });
    expect(await sendResetPasswordEmail("qa@example.test", "token-unit")).toBe(false);
  });
});
