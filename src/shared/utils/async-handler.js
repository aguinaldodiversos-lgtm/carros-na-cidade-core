/**
 * Canonical asyncHandler — wraps async Express route handlers to forward errors to next().
 * Single source of truth; eliminates the duplicates in account.routes.js, auth.routes.js, payments.routes.js.
 *
 * @param {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>} fn
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
