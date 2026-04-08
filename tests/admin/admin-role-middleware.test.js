import { describe, it, expect } from "vitest";
import { requireRole, requireAdmin } from "../../src/shared/middlewares/role.middleware.js";
import { USER_ROLE } from "../../src/shared/constants/status.js";

function mockReq(overrides = {}) {
  return { user: { id: "u1", role: "user", plan: "free" }, ...overrides };
}
function mockRes() {
  return { status: () => ({ json: () => {} }) };
}

describe("requireRole middleware", () => {
  it("blocks user without req.user", () => {
    const middleware = requireRole(USER_ROLE.ADMIN);
    const next = (err) => {
      expect(err).toBeTruthy();
      expect(err.statusCode).toBe(401);
    };
    middleware({}, mockRes(), next);
  });

  it("blocks regular user from admin routes", () => {
    const middleware = requireRole(USER_ROLE.ADMIN);
    const next = (err) => {
      expect(err).toBeTruthy();
      expect(err.statusCode).toBe(403);
    };
    middleware(mockReq(), mockRes(), next);
  });

  it("allows admin user through", () => {
    const middleware = requireRole(USER_ROLE.ADMIN);
    let called = false;
    const next = (err) => {
      expect(err).toBeUndefined();
      called = true;
    };
    middleware(mockReq({ user: { id: "a1", role: "admin" } }), mockRes(), next);
    expect(called).toBe(true);
  });

  it("allows multiple roles", () => {
    const middleware = requireRole(USER_ROLE.USER, USER_ROLE.ADMIN);
    let called = false;
    const next = (err) => {
      expect(err).toBeUndefined();
      called = true;
    };
    middleware(mockReq(), mockRes(), next);
    expect(called).toBe(true);
  });
});

describe("requireAdmin shortcut", () => {
  it("blocks non-admin", () => {
    const middleware = requireAdmin();
    const next = (err) => {
      expect(err).toBeTruthy();
      expect(err.statusCode).toBe(403);
    };
    middleware(mockReq(), mockRes(), next);
  });

  it("allows admin", () => {
    const middleware = requireAdmin();
    let called = false;
    const next = (err) => {
      expect(err).toBeUndefined();
      called = true;
    };
    middleware(mockReq({ user: { id: "a1", role: "admin" } }), mockRes(), next);
    expect(called).toBe(true);
  });
});
