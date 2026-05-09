import * as adReportsService from "./ad-reports.service.js";

/**
 * Resolve o IP de origem respeitando proxies (Render/Cloudflare/etc).
 * Preferência: req.ip (Express, com `trust proxy`), fallback X-Forwarded-For.
 *
 * NUNCA logamos o IP cru — o service já calcula o hash sha256 antes de
 * persistir. Aqui apenas retornamos a string para o service hashear.
 */
function resolveReporterIp(req) {
  if (req.ip && typeof req.ip === "string" && req.ip.trim()) return req.ip.trim();
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    // X-Forwarded-For pode vir como "client, proxy1, proxy2" — pegamos
    // o primeiro elemento, que é o cliente original.
    return xff.split(",")[0].trim();
  }
  if (req.socket?.remoteAddress) return String(req.socket.remoteAddress);
  return "";
}

/**
 * POST /api/ads/:id/report
 *
 * Aceita anônimo (sem auth) e logado (com auth opcional). O endpoint NÃO
 * está sob authMiddleware obrigatório para reduzir fricção; o reporter_user_id
 * só é preenchido quando req.user vier de um middleware otimista que já
 * estiver montado em outras rotas (caso contrário, é null).
 */
export async function create(req, res, next) {
  try {
    const reporterIp = resolveReporterIp(req);
    const reporterUserId = req.user?.id || req.user?.userId || null;

    const reportInput = {
      adId: req.params.id,
      reason: req.body?.reason,
      description: req.body?.description,
      reporterUserId,
      reporterIp,
    };

    const report = await adReportsService.createReport(reportInput);

    res.status(201).json({
      success: true,
      data: report,
      message:
        "Denúncia recebida. Nossa equipe vai revisar este anúncio. Obrigado por ajudar a manter o portal seguro.",
    });
  } catch (err) {
    next(err);
  }
}
