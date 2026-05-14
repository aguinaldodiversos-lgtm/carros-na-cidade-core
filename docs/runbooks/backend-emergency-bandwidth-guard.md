# Backend — Emergency Bandwidth Guard (2026-05-14)

**Contexto:** terceira iteração do fix de outbound bandwidth do Render. Iterações anteriores (`backend-bandwidth-incident.md`, `vehicle-images-bandwidth-incident.md`) cortaram imagens e geração ingênua de sitemap. Mas Cloudflare ainda mostra `cf-cache-status: DYNAMIC` em sitemaps — requests chegam ao origin do Render, provavelmente porque (a) bots batem direto no `*.onrender.com` sem passar pelo CF, (b) Cloudflare não está com "Cache Everything" configurado, ou (c) a cardinalidade dos paths derrota o cache.

Este PR ataca no origin: corta bots conhecidos antes do routing, freza sitemaps publicamente até o portal estar pronto, e instrumenta diagnóstico em janela curta para mapear quem ainda bate.

## Mapa página pública → endpoints backend

| Página frontend | Endpoints backend chamados (SSR) | Notas |
| --- | --- | --- |
| `/comprar` | `GET /api/ads/search`, `GET /api/ads/facets` | revalidate 60s |
| `/comprar/cidade/[slug]` | `GET /api/public/cities/{slug}`, `GET /api/ads/search?city_slug=...`, `GET /api/ads/facets`, + até 2 fetches de fallback territorial | até 4 calls por hit |
| `/cidade/[slug]` | `GET /api/public/cities/{slug}` | territorial consolidada |
| `/carros-usados/regiao/[slug]` | `GET /api/internal/regions/{slug}` (token), `GET /api/ads/search?city_slugs=...` | privado + multi-cidade |
| `/blog/[cidade]/[slug]` | `GET /content/public/blog-page?city_slug={slug}` | revalidate 300s |
| `/sitemap.xml` + `/sitemaps/*.xml` | `GET /api/public/seo/sitemap/type/{type}?limit=50000` (N tipos) | **N × 50k itens, alvo principal de bots** |
| `/robots.txt` | nenhum | gerador estático |

Frontend SSR fala com backend via URL **pública** `https://carros-na-cidade-core.onrender.com`. Render Private Network **não configurada** — qualquer bot pode bater o backend direto pulando o frontend e o CF na frente.

## Arquivos alterados

| Arquivo | O que mudou |
| --- | --- |
| [src/shared/middlewares/bandwidth-diagnostics.middleware.js](../../src/shared/middlewares/bandwidth-diagnostics.middleware.js) | **Novo.** Conta bytes por request (wrap em `res.write/end`), agrega por janela de 60s, emite JSON em stdout. Não loga body/cookies/auth. Spikes >512KB emitem linha individual. |
| [src/shared/middlewares/bot-blocker.middleware.js](../../src/shared/middlewares/bot-blocker.middleware.js) | **Novo.** UA regex blocklist (24 padrões: SEO scrapers, AI crawlers, HTTP clients genéricos, headless). Allowlist explícita para Googlebot/Bingbot/DuckDuckBot. Resposta 429 + Retry-After 86400 + corpo mínimo `{"error":"rate_limited"}`. |
| [src/shared/middlewares/rateLimit.middleware.js](../../src/shared/middlewares/rateLimit.middleware.js) | Adicionados 7 rate limits específicos: sitemap (5/min), vehicle-images (10/min), ads (30/min), ads/search (20/min), public/cities (30/min), search (20/min), uploads (5/min). Cada um responde 429 com corpo mínimo. |
| [src/modules/public/public-seo.controller.js](../../src/modules/public/public-seo.controller.js) | Kill switch: se `SITEMAP_PUBLIC_ENABLED !== "true"`, os 4 endpoints respondem 503 leve + Retry-After + X-Robots-Tag noindex, sem chamar service. |
| [src/shared/cache/cache.middleware.js](../../src/shared/cache/cache.middleware.js) | `cacheGet` agora aceita `allowedQueryKeys` — whitelist de params que entram na key. Mata cache key explosion por params lixo (utm, fbclid, _t). |
| [src/app.js](../../src/app.js) | Plug dos middlewares novos (diagnostics → X-Robots-Tag global → bot blocker → routing); `GET /robots.txt` com `Disallow: /`; rate limits específicos aplicados a `/api/public/seo/sitemap`, `/api/public/cities`, `/api/ads/search`, `/api/ads`, `/api/search`, `/api/vehicle-images`, `/uploads`. |
| [.env.example](../../.env.example) | Envs do guard documentadas. |
| **Testes:** | |
| [tests/shared/bot-blocker.middleware.test.js](../../tests/shared/bot-blocker.middleware.test.js) | 41 testes — 24 bots ruins, 6 bots bons, 3 humanos, allowlist de paths, flag OFF/ON. |
| [tests/shared/bandwidth-diagnostics.middleware.test.js](../../tests/shared/bandwidth-diagnostics.middleware.test.js) | 19 testes — normalização de path, classificação de route_group, UA summary, conta bytes, spike, sem leak de body/cookies/auth. |
| [tests/public/public-seo-sitemap-killswitch.test.js](../../tests/public/public-seo-sitemap-killswitch.test.js) | 8 testes — 4 endpoints OFF (503 leve), 2 endpoints ON (cache forte), false explícito. |
| [tests/shared/cache-middleware-allowed-keys.test.js](../../tests/shared/cache-middleware-allowed-keys.test.js) | 4 testes — sem whitelist mantém legado, com whitelist ignora params lixo. |

## Envs a setar no Render `carros-na-cidade-core`

| Env | Valor | Efeito |
| --- | --- | --- |
| `BAD_BOTS_BLOCKED` | `true` | bloqueia 24 UAs de bot (Ahrefs, Semrush, Bytespider, PetalBot, GPTBot, ClaudeBot, python-requests, curl, ...). Googlebot/Bingbot intactos |
| `SITEMAP_PUBLIC_ENABLED` | `false` (ou ausente) | sitemaps respondem 503 leve enquanto o portal está em dev |
| `BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED` | `true` | liga diagnóstico stdout por 30-60min |
| `BACKEND_IMAGE_PROXY_FALLBACK_ENABLED` | `false` (mantém) | imagens continuam via redirect 302 |
| `SERVE_UPLOADS_STATIC` | `false` (mantém) | `/uploads` desmontado |
| `R2_PUBLIC_BASE_URL` | `https://pub-662ff7f9e6a946168e27ca660899bc3f.r2.dev` (mantém) | redirect base |

Após 30-60min de observação: setar `BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED=false` para parar o ruído de logs.

## Validação com curl (pós-deploy)

```bash
BACKEND=https://carros-na-cidade-core.onrender.com

# 1. /robots.txt fechado
curl -s "$BACKEND/robots.txt"
# Esperado: "User-agent: *\nDisallow: /"

# 2. Sitemap bloqueado (kill switch)
curl -sI "$BACKEND/api/public/seo/sitemap"
# Esperado: HTTP/1.1 503, Retry-After: 3600, X-Robots-Tag: noindex,...
curl -sI "$BACKEND/api/public/seo/sitemap.json"
# Esperado: HTTP/1.1 503
curl -sI "$BACKEND/api/public/seo/sitemap/type/estado"
# Esperado: HTTP/1.1 503
curl -sI "$BACKEND/api/public/seo/sitemap/region/sp"
# Esperado: HTTP/1.1 503

# 3. vehicle-images segue 302
curl -sI "$BACKEND/api/vehicle-images?key=vehicles/teste.webp"
# Esperado: HTTP/1.1 302 + Location: https://pub-...r2.dev/vehicles/teste.webp

# 4. Bad bot bloqueado em /api/ads
curl -sI -H "User-Agent: AhrefsBot/7.0" "$BACKEND/api/ads"
# Esperado: HTTP/1.1 429, Retry-After: 86400, corpo {"error":"rate_limited"}

# 5. Googlebot NÃO é bloqueado (verifica que rate limit fica generoso)
curl -sI -H "User-Agent: Mozilla/5.0 (compatible; Googlebot/2.1)" "$BACKEND/api/ads"
# Esperado: NÃO 429 do bot-blocker (pode ser 429 do rate limit se bater muito)

# 6. X-Robots-Tag global em qualquer rota
curl -sI "$BACKEND/health" | grep -i x-robots
# Esperado: x-robots-tag: noindex, nofollow, noarchive
```

## Validação no Render Metrics

1. **Antes do deploy**: screenshot `carros-na-cidade-core → Metrics → Outbound Bandwidth`, Last 1h e Last 24h.
2. **Após deploy** (e envs setadas): aguardar 30 min.
3. **Critério de sucesso**: inclinação cai de **GB/h para MB/h**.
4. CPU/Memory devem se manter ou cair (handler de sitemap não roda mais).

## Validação via Render Logs

Com `BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED=true`:

- Procure `"event":"backend_bandwidth"` — uma linha por janela de 60s com top route_groups, top paths, top UAs, status codes.
- Procure `"event":"backend_bandwidth_spike"` — requests individuais >512KB. Se aparecer com `route_group: sitemap`, alguém está burlando o kill switch (não deveria).
- Esperado em condição saudável:
  - **`top_route_groups`** dominado por `health`, `public_other`, `ads` (cache hits no Redis devem ser baixos em bytes — só JSON pequeno).
  - **Sitemaps**: 503 com bytes < 300 cada — confirma kill switch ativo.
  - **`top_user_agents`**: Googlebot/Bingbot OK; se ver `bot:ahrefs`/`tool:http-client` com counts altos significa que o blocker está OFF ou o IP do bot está saindo do nosso allowlist.

## Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| `BAD_BOTS_BLOCKED=true` cega ferramenta interna que use `curl`/`axios`/`node-fetch` sem UA customizado | Tools internas devem setar UA tipo `cnc-internal/1.0`. Nada match. Logs do diagnóstico exibem 429 em route_group esperado se acontecer. |
| Googlebot real é raro mas o `Googlebot-Image` faz indexação separada | Pattern `Googlebot` casa ambos. Allowlist preserva. |
| Frontend SSR chama `/api/public/seo/sitemap/*` mesmo após kill switch | Frontend SSR também recebe 503 nessa janela. Como o frontend já tem fallback (geradores Next mais defensivos), o XML do `/sitemaps/*.xml` no carrosnacidade.com pode ficar com poucas URLs até reativar. Aceitável enquanto o portal está em dev. |
| Rate limit muito agressivo derruba humano | Limits são por minuto (não por janela longa). Humano clica 1-2 cards/seg max; 30 req/min em `/api/ads` é folgado. |
| Cache key whitelist (não aplicada ainda nas rotas existentes) | Foi adicionado o **parâmetro** novo `allowedQueryKeys` em `cacheGet`, mas as rotas existentes ainda não passam ele — então comportamento atual é preservado. Próximo PR aplica nas rotas pesadas (ads/cities). |

## Rollback

Cada mecanismo desliga via env (sem deploy):

| Mudança | Reverso |
| --- | --- |
| Bot blocker | `BAD_BOTS_BLOCKED=false` ou remover env |
| Kill switch sitemap | `SITEMAP_PUBLIC_ENABLED=true` |
| Diagnóstico | `BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED=false` |
| Rate limits específicos | só por `git revert` (limits são parte do código). Limits são generosos pra humano. |
| X-Robots-Tag global | `git revert` (1 linha de middleware) |
| /robots.txt | `git revert` (1 handler em app.js) |

Nada toca o banco, request_audit_logs, frontend, regras comerciais, ranking, planos ou layout.

## Próximos passos se a inclinação não cair

1. **Confirmar Cloudflare em frente do backend.** Hoje `cf-cache-status: DYNAMIC` sugere que ou o CF não está cacheando, ou bots batem direto no `*.onrender.com`. Se for a 2ª: bloquear pelo Render Service Mesh / IP whitelist para aceitar só CF.
2. **Aplicar `allowedQueryKeys` nas rotas de ads/cities.** Já está disponível em `cacheGet` — só falta passar a whitelist quando as rotas forem auditadas.
3. **Reduzir payload de listagem `/api/ads`** (descrição/telefone/vendor só em detail). Adia agora pra não tocar regras de negócio.
4. **Render Private Network** entre frontend e backend (zera bandwidth interno).
