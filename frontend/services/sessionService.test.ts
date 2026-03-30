import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSessionToken,
  getSessionDataFromCookieValue,
  getSessionUserFromCookieValue,
} from "./sessionService";

describe("sessionService", () => {
  const prevSecret = process.env.AUTH_SESSION_SECRET;

  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = "unit-test-session-secret-32chars!!";
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = prevSecret;
  });

  it("createSessionToken + getSessionDataFromCookieValue roundtrip", () => {
    const token = createSessionToken({
      id: "u1",
      name: "Test",
      email: "t@example.com",
      type: "CPF",
      accessToken: "at",
      refreshToken: "rt",
    });
    const data = getSessionDataFromCookieValue(token);
    expect(data).toEqual({
      id: "u1",
      name: "Test",
      email: "t@example.com",
      type: "CPF",
      accessToken: "at",
      refreshToken: "rt",
    });
  });

  it("cookie com assinatura adulterada → null", () => {
    const token = createSessionToken({
      id: "u1",
      name: "Test",
      email: "t@example.com",
      type: "CPF",
    });
    const [body] = token.split(".");
    const bad = `${body}.wrongsig`;
    expect(getSessionDataFromCookieValue(bad)).toBeNull();
  });

  it("getSessionUserFromCookieValue expõe só campos públicos", () => {
    const token = createSessionToken({
      id: "u1",
      name: "Test",
      email: "t@example.com",
      type: "CPF",
      accessToken: "secret-at",
      refreshToken: "secret-rt",
    });
    expect(getSessionUserFromCookieValue(token)).toEqual({
      id: "u1",
      name: "Test",
      email: "t@example.com",
      type: "CPF",
    });
  });
});
