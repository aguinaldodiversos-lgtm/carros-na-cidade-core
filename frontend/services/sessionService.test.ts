import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSessionToken,
  getSessionDataFromCookieValue,
  getSessionUserFromCookieValue,
} from "./sessionService";

describe("sessionService", () => {
  const prevSecret = process.env.AUTH_SESSION_SECRET;
  const prevNodeEnv = process.env.NODE_ENV;

  function envRecord() {
    return process.env as Record<string, string | undefined>;
  }

  beforeEach(() => {
    envRecord().AUTH_SESSION_SECRET = "unit-test-session-secret-32chars!!";
  });

  afterEach(() => {
    const env = envRecord();
    if (prevSecret === undefined) delete env.AUTH_SESSION_SECRET;
    else env.AUTH_SESSION_SECRET = prevSecret;
    if (prevNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = prevNodeEnv;
  });

  it("createSessionToken + cookies de token + getSessionDataFromCookieValue roundtrip", () => {
    const token = createSessionToken({
      id: "u1",
      name: "Test",
      email: "t@example.com",
      type: "CPF",
      accessToken: "at",
      refreshToken: "rt",
    });
    const data = getSessionDataFromCookieValue(token, "at", "rt");
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
    expect(getSessionUserFromCookieValue(token, "secret-at", "secret-rt")).toEqual({
      id: "u1",
      name: "Test",
      email: "t@example.com",
      type: "CPF",
    });
  });

  it("usa segredo efemero em producao sem AUTH_SESSION_SECRET", () => {
    const env = envRecord();
    delete env.AUTH_SESSION_SECRET;
    env.NODE_ENV = "production";

    const token = createSessionToken({
      id: "u1",
      name: "Test",
      email: "t@example.com",
      type: "CPF",
    });

    expect(getSessionDataFromCookieValue(token)).toMatchObject({
      id: "u1",
      name: "Test",
      email: "t@example.com",
      type: "CPF",
    });
  });
});
