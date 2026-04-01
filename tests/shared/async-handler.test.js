import { describe, it, expect, vi } from "vitest";
import { asyncHandler } from "../../src/shared/utils/async-handler.js";

describe("asyncHandler", () => {
  it("chama next(err) quando a função async lança erro", async () => {
    const error = new Error("test error");
    const fn = async () => { throw error; };
    const next = vi.fn();
    const req = {}, res = {};

    const handler = asyncHandler(fn);
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("não chama next quando a função resolve normalmente", async () => {
    const fn = async (_req, res) => { res.sent = true; };
    const next = vi.fn();
    const req = {}, res = {};

    const handler = asyncHandler(fn);
    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.sent).toBe(true);
  });
});
