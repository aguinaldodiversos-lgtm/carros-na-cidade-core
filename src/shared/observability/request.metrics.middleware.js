import { incrementCounter, observeHistogram } from "./metrics.registry.js";

export function requestMetricsMiddleware(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const labels = {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: String(res.statusCode),
    };

    incrementCounter("http_requests_total", 1, labels);
    observeHistogram("http_request_duration_ms", durationMs, labels);
  });

  next();
}
