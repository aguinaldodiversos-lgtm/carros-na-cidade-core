# Backend — 404 storm e UA `node` (2026-05-14, quarta iteração)

## Causa raiz (confirmada nos logs)

Após as iterações anteriores, Render Outbound Bandwidth ainda subia. Os logs do backend mostraram rajadas de:

```
userAgent: "node"
statusCode: 404
durationMs: 0-4ms
path: /catalog/ads/<slug-gigante>
      /public/listings/<slug-gigante>
      /public/ads/<slug-gigante>
      /ads/<slug-gigante>
      /api/ads/slug/<slug-gigante>
      /api/ads/by-slug/<slug-gigante>
```

Os slugs eram concatenações de modelos: `jeep-renegade-byd-yuan-plus-nissan-kicks-honda-civic-caoa-chery-tiggo-7`. Dezenas de requests/segundo do mesmo IP.

**Três falhas combinadas:**

1. **Bot blocker não pegava UA `node` puro.** O regex casava `node-fetch`, mas não a string literal `node` (UA default do fetch global em Node 18+). Bots Node passavam direto.
2. **Cada 404 atravessava o error handler com level 50.** `app.use((req, _res, next) => next(new AppError("Rota não encontrada: ...", 404)))` virava `logger.error(...)` com stack e body grande (`{success, error, message, requestId, ...}`) — ruído operacional + bandwidth por resposta.
3. **`clientRateLimitKey` não considerava `CF-Connecting-IP`.** Se Cloudflare está na frente do origin, a chave de rate limit caía em `X-Forwarded-For` ou `req.ip` — pode acabar agrupando bots distintos sob o mesmo IP de edge.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| [src/shared/middlewares/bot-blocker.middleware.js](../../src/shared/middlewares/bot-blocker.middleware.js) | UA literal `node` adicionado à blocklist. Allowlist forte: UA `cnc-internal/1.0` + `X-Internal-Token === INTERNAL_API_TOKEN`. **Compat fraca temporária**: UA `node` + `X-Cnc-Client-Ip` (marca do BFF) passa — protege frontend SSR enquanto não migra para UA interno. Outras UAs (Ahrefs, python-requests etc.) NÃO ganham compat. |
| [src/shared/middlewares/rateLimit.middleware.js](../../src/shared/middlewares/rateLimit.middleware.js) | `clientRateLimitKey` agora prefere `CF-Connecting-IP` → `X-Cnc-Client-Ip` → `X-Forwarded-For` → `req.ip`. |
| [src/shared/middlewares/legacy-routes-guard.middleware.js](../../src/shared/middlewares/legacy-routes-guard.middleware.js) | **Novo.** Intercepta prefixos legacy/inexistentes (`/catalog/ads/*`, `/public/listings/*`, `/public/ads/*`, `/ads/<slug>`, `/api/ads/slug/*`, `/api/ads/by-slug/*`, `/listings*`) ANTES de qualquer router. Responde 410 leve com `Cache-Control: public, max-age=300`. Também detecta slug abusivo (>120 chars ou >8 hífens) em paths que parecem rota pública. |
| [src/shared/middlewares/404-storm-guard.middleware.js](../../src/shared/middlewares/404-storm-guard.middleware.js) | **Novo.** Counter em memória por (IP real, UA). Após `PUBLIC_404_STORM_THRESHOLD` 404s em 60s, bloqueia o par por `PUBLIC_404_STORM_BLOCK_SECONDS` (default 1h) — responde 429 leve. Controlado por `PUBLIC_404_STORM_GUARD_ENABLED`. Emite linha `"event":"public_404_storm_blocked"` em stdout. |
| [src/shared/middlewares/error.middleware.js](../../src/shared/middlewares/error.middleware.js) | 404 operacional vira `logger.warn` (sem stack) e responde corpo mínimo `{success:false,error:"not_found"}` + `Cache-Control: public, max-age=60`. 5xx e outros 4xx mantêm `logger.error`. |
| [src/app.js](../../src/app.js) | Plug do `legacyRoutesGuardMiddleware` e `publicStormGuardMiddleware` depois do bot blocker e antes dos routers. |
| [.env.example](../../.env.example) | `PUBLIC_404_STORM_GUARD_ENABLED`, `INTERNAL_API_TOKEN`, tuning vars. |
| **Testes:** | |
| [tests/shared/bot-blocker.middleware.test.js](../../tests/shared/bot-blocker.middleware.test.js) | +18 testes (UA `node`, allowlist interna, BFF compat). 59 total. |
| [tests/shared/rateLimit.middleware.test.js](../../tests/shared/rateLimit.middleware.test.js) | +3 testes (CF-Connecting-IP). 10 total. |
| [tests/shared/legacy-routes-guard.middleware.test.js](../../tests/shared/legacy-routes-guard.middleware.test.js) | **Novo**, 31 testes — todos os prefixos legados, slug abusivo, falsos positivos. |
| [tests/shared/404-storm-guard.middleware.test.js](../../tests/shared/404-storm-guard.middleware.test.js) | **Novo**, 8 testes — counter, isolamento por IP/UA, /health allowlisted, evento stdout, TTL. |
| [tests/shared/error-middleware-404.test.js](../../tests/shared/error-middleware-404.test.js) | **Novo**, 6 testes — 404 vira warn, sem stack, corpo mínimo. |

## Envs no Render `carros-na-cidade-core`

```
BAD_BOTS_BLOCKED=true
PUBLIC_404_STORM_GUARD_ENABLED=true
EMERGENCY_BANDWIDTH_GUARD_ENABLED=true        # documentação — não usado em código (cada flag tem own switch)
BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED=true    # ligar 30-60min, depois desligar
SITEMAP_PUBLIC_ENABLED=false
BACKEND_IMAGE_PROXY_FALLBACK_ENABLED=false
SERVE_UPLOADS_STATIC=false
INTERNAL_API_TOKEN=<valor já configurado no Render para /api/internal/regions>
```

Opcional (tuning do storm guard):
```
PUBLIC_404_STORM_THRESHOLD=15           # default 15
PUBLIC_404_STORM_BLOCK_SECONDS=3600     # default 3600 (1h)
```

## Validação com curl (pós-deploy)

```bash
BACKEND=https://carros-na-cidade-core.onrender.com

# 1. UA "node" puro em /api/ads → 429
curl -sI -H "User-Agent: node" "$BACKEND/api/ads"
# Esperado: HTTP/1.1 429, Retry-After: 86400, {"error":"rate_limited"}

# 2. UA "node" + X-Cnc-Client-Ip (BFF compat) → 200/304
curl -sI -H "User-Agent: node" -H "X-Cnc-Client-Ip: 203.0.113.42" "$BACKEND/api/ads"
# Esperado: NÃO 429

# 3. UA cnc-internal/1.0 + token correto → passa
curl -sI -H "User-Agent: cnc-internal/1.0" -H "X-Internal-Token: $INTERNAL_API_TOKEN" "$BACKEND/api/ads"
# Esperado: NÃO 429

# 4. UA cnc-internal/1.0 SEM token → NÃO ganha bypass (mas UA não está blocklisted, passa por outras razões)
curl -sI -H "User-Agent: cnc-internal/1.0" "$BACKEND/api/ads"

# 5. /catalog/ads/<slug> → 410 leve
curl -sI "$BACKEND/catalog/ads/jeep-renegade-honda-civic"
# Esperado: HTTP/1.1 410, {"error":"gone"}, Cache-Control: max-age=300

# 6. /public/listings/foo → 410
curl -sI "$BACKEND/public/listings/foo"

# 7. /api/ads/slug/algum-slug → 410
curl -sI "$BACKEND/api/ads/slug/algum-slug"

# 8. Slug abusivo em /api/ads → 410
curl -sI "$BACKEND/api/ads/jeep-renegade-byd-yuan-plus-nissan-kicks-honda-civic-caoa-chery-tiggo-7"

# 9. Rota inexistente comum (404 normal, corpo enxuto)
curl -s "$BACKEND/api/nao-existe"
# Esperado: {"success":false,"error":"not_found"} (sem requestId/message)

# 10. AhrefsBot continua bloqueado
curl -sI -H "User-Agent: AhrefsBot/7.0" "$BACKEND/api/ads"
# Esperado: HTTP/1.1 429

# 11. Chrome real continua passando
curl -sI -H "User-Agent: Mozilla/5.0 Chrome/120" "$BACKEND/api/ads"
# NÃO 429

# 12. CF-Connecting-IP usado para rate limit (simulação)
# A partir de um único IP "real" via header, dispare múltiplas requests:
for i in $(seq 1 50); do
  curl -s -o /dev/null -w "%{http_code} " -H "User-Agent: node" -H "CF-Connecting-IP: 198.51.100.99" "$BACKEND/api/nao-existe"
done
echo
# Esperado: começa com 410/429 e em ~15-20 hits passa a 429 storm guard.
```

## Validação via Render Logs

Com `BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED=true` + `PUBLIC_404_STORM_GUARD_ENABLED=true`:

- `"event":"backend_bandwidth"` (a cada 60s) — top route_groups deve ter `health`, `ads`, sem `sitemap` (kill switch). `top_user_agents`: Googlebot/Bingbot OK; `bot:ahrefs`/`tool:http-client`/`other:node` (sem header BFF) devem ter status 429.
- `"event":"public_404_storm_blocked"` — aparece quando um IP+UA estoura threshold. Inclui `ua_summary`, `ip_hash`, `count_404`, `sample_path`. Se o storm guard estiver pegando bots Node, vemos `ua_summary: "other:node"`.
- 404s individuais agora caem como `[http] 404: rota inexistente` (level warn), não como error com stack.

## Validação no Render Metrics

1. Snapshot Outbound Bandwidth (Last 1h e Last 24h) antes.
2. Set as envs → deploy.
3. Aguardar 30-60min.
4. **Critério de sucesso: inclinação cai de GB/h para MB/h**. CPU/Memory também caem (sem error handler caro nos 404s).

## Riscos

| Risco | Mitigação |
|---|---|
| Frontend SSR usa UA `node` literal e sem `X-Cnc-Client-Ip` em algumas rotas → cortado | Compat fraca (UA `node` + `X-Cnc-Client-Ip` libera). Frontend já manda esse header em todas as chamadas BFF. Próximo PR migra para UA `cnc-internal/1.0` + token explicitamente. |
| Bot forja `X-Cnc-Client-Ip` para burlar | É camada FRACA. Mas (a) é header custom específico do projeto que bots casuais não conhecem; (b) bot ainda passa pelo rate limit normal por IP forjado; (c) caminho preferido é `cnc-internal/1.0 + token` (forte). |
| `PUBLIC_404_STORM_THRESHOLD=15` muito baixo, bloqueia humanos navegando | Improvável: humano não bate 15 URLs 404 em 60s. Caso aconteça, aumentar via env (suporta até 1000). |
| Slug abusivo legítimo (anúncio com nome ultra longo) | Limite é 120 chars OU 9+ hífens — anúncios reais raramente têm slug assim. Se acontecer, ajustar `MAX_SAFE_SLUG_LENGTH`. |

## Rollback (sem deploy)

| Mudança | Reverso |
|---|---|
| Bot blocker (incluindo UA `node`) | `BAD_BOTS_BLOCKED=false` |
| 404 storm guard | `PUBLIC_404_STORM_GUARD_ENABLED=false` |
| Legacy routes guard | `git revert` (sem env — sempre ligado, é puramente defensivo) |
| Error handler 404 enxuto | `git revert` (não tem env) |
| CF-Connecting-IP | `git revert` |

Nada toca banco, `request_audit_logs`, frontend, ranking, planos, layout, design system ou monetização.

## Próximos passos se a inclinação não cair

1. Atualizar frontend SSR/BFF: UA `cnc-internal/1.0` + `X-Internal-Token` em todas as chamadas para o backend. Remove dependência da compat fraca por `X-Cnc-Client-Ip`.
2. Bloqueio de IPs de edge não-Cloudflare no Render (aceitar só CF ranges).
3. Render Private Network entre frontend e backend.
4. Aplicar `allowedQueryKeys` (já disponível em `cacheGet`) nas rotas pesadas.
