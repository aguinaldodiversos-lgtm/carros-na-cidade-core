import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ensureSessionWithFreshBackendTokens } from "./ensure-backend-session";
import type { SessionData } from "@/services/sessionService";

vi.mock("@/lib/auth/jwt-access", () => ({
  accessTokenNeedsRefresh: vi.fn(),
}));

vi.mock("@/lib/auth/refresh-backend-tokens", () => ({
  refreshBackendTokens: vi.fn(),
}));

import { accessTokenNeedsRefresh } from "@/lib/auth/jwt-access";
import { refreshBackendTokens } from "@/lib/auth/refresh-backend-tokens";

const mockNeedsRefresh = vi.mocked(accessTokenNeedsRefresh);
const mockRefresh = vi.mocked(refreshBackendTokens);

function makeSession(overrides?: Partial<SessionData>): SessionData {
  return {
    id: "u1",
    name: "Test",
    email: "t@example.com",
    type: "CPF",
    accessToken: "valid-at",
    refreshToken: "valid-rt",
    ...overrides,
  };
}

describe("ensureSessionWithFreshBackendTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok with session when token is fresh", async () => {
    mockNeedsRefresh.mockReturnValue(false);
    const session = makeSession();
    const result = await ensureSessionWithFreshBackendTokens(session);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session).toBe(session);
      expect(result.persistCookies).toBeUndefined();
    }
  });

  it("returns failure for null session", async () => {
    const result = await ensureSessionWithFreshBackendTokens(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_session");
  });

  it("returns failure for session without id", async () => {
    const result = await ensureSessionWithFreshBackendTokens(makeSession({ id: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_session");
  });

  it("returns failure when no tokens at all", async () => {
    const result = await ensureSessionWithFreshBackendTokens(
      makeSession({ accessToken: undefined, refreshToken: undefined })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cannot_refresh");
  });

  it("refreshes token when expired and returns new cookies", async () => {
    mockNeedsRefresh.mockReturnValue(true);
    mockRefresh.mockResolvedValue({
      accessToken: "new-at",
      refreshToken: "new-rt",
    });

    const session = makeSession();
    const result = await ensureSessionWithFreshBackendTokens(session);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.accessToken).toBe("new-at");
      expect(result.session.refreshToken).toBe("new-rt");
      expect(result.persistCookies).toBeDefined();
      expect(result.persistCookies?.accessToken).toBe("new-at");
    }
  });

  it("returns failure when refresh fails and no access token", async () => {
    mockNeedsRefresh.mockReturnValue(true);
    mockRefresh.mockResolvedValue(null);

    const session = makeSession();
    const result = await ensureSessionWithFreshBackendTokens(session);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cannot_refresh");
  });

  it("returns failure when needs refresh but no refresh token", async () => {
    mockNeedsRefresh.mockReturnValue(true);
    const session = makeSession({ refreshToken: undefined });
    const result = await ensureSessionWithFreshBackendTokens(session);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cannot_refresh");
  });
});
