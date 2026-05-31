import * as adReportsService from "./ad-reports.service.js";

/**
 * Resolve o IP de origem respeitando proxies (Render/Cloudflare/etc).
 *
 * Ordem de prioridade (Fase 3.4 — alinhada a
 * src/shared/middlewares/rateLimit.middleware.js#clientRateLimitKey):
 *   1. `CF-Connecting-IP`   — Cloudflare na frente do origin.
 *   2. `X-Cnc-Client-Ip`    — BFF do frontend (Next.js) repassa o IP do
 *                             visitante real via buildBffBackendForwardHeaders.
 *                             Sem isso, denúncias vindas pela rota
 *                             `/api/ads/:id/report` (proxiada pelo Next)
 *                             teriam todas o mesmo IP (do container do BFF)
 *                             e o rate-limit por IP×ad ficaria inutilizável.
 *   3. `req.ip`             — Express com `trust proxy=1`.
 *   4. `X-Forwarded-For`    — primeiro elemento (cliente original).
 *   5. `req.socket.remoteAddress` — fallback final.
 *
 * NUNCA logamos o IP cru — o service já calcula o hash sha256 antes de
 * persistir. Aqui apenas retornamos a string para o service hashear.
 */
function resolveReporterIp(req) {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();

  const bff = req.headers["x-cnc-client-ip"];
  if (typeof bff === "string" && bff.trim()) return bff.trim();

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
      // Mensagem alinhada à Fase 3.4: deixar explícito que o anúncio
      // continua visível até análise da equipe — evita pânico de
      // anunciantes legítimos quando recebem denúncia falsa de concorrente.
      message:
        "Denúncia enviada. O anúncio continuará visível até análise da equipe, para evitar bloqueios indevidos por denúncias falsas.",
    });
  } catch (err) {
    next(err);
  }
}
