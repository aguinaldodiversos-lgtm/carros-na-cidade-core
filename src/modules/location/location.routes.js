import express from "express";

import { requireInternalToken } from "../regions/regions.middleware.js";

import { resolveLocationEndpoint } from "./location.controller.js";

/**
 * Rotas internas de resolução de localização.
 *
 * Mesmo padrão de `/api/internal/regions/*`:
 *   - exige `X-Internal-Token` válido (caso contrário, 404 anti-enumeração).
 *   - reusa o middleware do módulo regions para manter contrato único.
 *
 * NÃO cacheamos no Redis: cada coordenada é única e o cache não traria
 * ganho material — só ocuparia espaço com chaves nunca reusadas. O cliente
 * (BFF Next) tem cache curto de seu lado se quiser (não recomendado para
 * coordenadas variáveis).
 *
 * NÃO usamos GET com query string para coordenadas: lat/long em URL
 * vazariam em logs de proxy/CDN. POST mantém o body fora de logs HTTP.
 */
const router = express.Router();

router.post("/resolve", requireInternalToken, resolveLocationEndpoint);

export default router;
