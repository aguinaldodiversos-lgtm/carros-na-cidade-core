import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session/ensure-backend-session", () => ({
  ensureSessionWithFreshBackendTokens: vi.fn(),
}));

vi.mock("@/lib/http/client-ip", () => ({
  buildBffBackendForwardHeaders: vi.fn(() => ({ "X-Cnc-Client-Ip": "1.2.3.4" })),
}));

vi.mock("@/services/sessionService", () => ({
  getSessionDataFromRequest: vi.fn(),
  applySessionCookiesToResponse: vi.fn(),
}));

import { authenticateBffRequest, applyBffCookies } from "./bff-session";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import { getSessionDataFromRequest } from "@/services/sessionService";

const mockEnsure = vi.mocked(ensureSessionWithFreshBackendTokens);
const mockGetSession = vi.mocked(getSessionDataFromRequest);

function fakeRequest() {
  return {
    cookies: { get: () => undefined },
    headers: { get: () => null },
  } as unknown as import("next/server").NextRequest;
}

describe("authenticateBffRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns authenticated context with backend headers", async () => {
    const session = {
      id: "u1",
      name: "Test",
      email: "t@example.com",
      type: "CPF" as const,
      accessToken: "at-123",
      refreshToken: "rt-123",
    };

    mockGetSession.mockReturnValue(session);
    mockEnsure.mockResolvedValue({ ok: true, session });

    const result = await authenticateBffRequest(fakeRequest());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.backendHeaders.Authorization).toBe("Bearer at-123");
      expect(result.ctx.backendHeaders["X-Cnc-Client-Ip"]).toBe("1.2.3.4");
      expect(result.ctx.backendHeaders.Accept).toBe("application/json");
    }
  });

  it("returns 401 response when session is invalid", async () => {
    mockGetSession.mockReturnValue(null);
    mockEnsure.mockResolvedValue({ ok: false, reason: "missing_session" });

    const result = await authenticateBffRequest(fakeRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });
});

describe("applyBffCookies", () => {
  it("is a no-op when no persistCookies", () => {
    const { NextResponse } = require("next/server");
    const res = NextResponse.json({ ok: true });
    const result = applyBffCookies(res, {});
    expect(result).toBe(res);
  });
});
