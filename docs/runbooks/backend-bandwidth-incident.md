# Incidente — outbound bandwidth do backend (Render)

**Data:** 2026-05-13
**Severidade:** P1 (Render Billing acendendo overage de bandwidth — 497 GB/mês).
**Status do fix (PR E1+E2):** completo neste commit.

## Sintoma

Após blindar o frontend (`unoptimized: true` no Next.js, imagens R2 servidas direto pelo Cloudflare), o **backend** continuou gerando bandwidth alto: Render Metrics mostrava cerca de 167 GB/mês no `carros-na-cidade-core`, dominado por "HTTP Responses". Como o tráfego humano do portal é baixíssimo (ainda em desenvolvimento), o consumo era anormal.

## Causa raiz

A auditoria identificou três vetores convergindo no origin Render:

1. **`/api/vehicle-images?key=...` carregava o R2 em RAM.** Handler em [src/modules/vehicle-images/vehicle-images.controller.js](../../src/modules/vehicle-images/vehicle-images.controller.js) chamava `readVehicleImage(key)` → `streamBodyToBuffer(response.Body)` em [src/infrastructure/storage/r2.service.js:501-526](../../src/infrastructure/storage/r2.service.js:501) e fazia `res.send(buffer)`. **Sem auth**, **sem rate limit específico**, **sem redirect**. Bots descobriam URLs por enumeração de `vehicles/{id}/...` e cada hit custava: egress R2 → Render + egress Render → cliente.
2. **Sitemap com cache fraco e variantes sem cache.** Em [src/modules/public/public-seo.controller.js](../../src/modules/public/public-seo.controller.js): XML canônico `max-age=300`, JSON `max-age=60`, `/type/:type` e `/region/:state` **sem nenhum Cache-Control**. Cada hit pode trazer ~10 MB com 50 000 URLs. Crawlers SEO (Ahrefs, Semrush, Bytespider, PetalBot) batem sitemap em loop — vetor mais provável dos GBs/dia.
3. **`/uploads` static condicional ligado por default sem env explícita.** Em [src/app.js:185](../../src/app.js:185), a verificação `process.env.SERVE_UPLOADS_STATIC !== "false"` ligava o middleware quando a env não estava setada — contradizendo o feature flag central que tem default OFF em produção.

## O que foi corrigido (PR E1+E2)

| Arquivo | Mudança |
| --- | --- |
| [src/modules/vehicle-images/vehicle-images.controller.js](../../src/modules/vehicle-images/vehicle-images.controller.js) | Caminho padrão é **302 redirect** para `R2_PUBLIC_BASE_URL/{key}`. Validação rigorosa de `?key=` (rejeita `..`, `\`, URLs absolutas, schemes perigosos, protocol-relative). Streaming SDK só com `BACKEND_IMAGE_PROXY_FALLBACK_ENABLED=true`. Sem R2 público e sem fallback → 404 leve (`max-age=60`). |
| [src/modules/public/public-seo.controller.js](../../src/modules/public/public-seo.controller.js) | Os 4 endpoints de sitemap agora respondem com `Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800`. Erros mantêm `no-store`. |
| [src/app.js](../../src/app.js) | `/uploads` só monta com `SERVE_UPLOADS_STATIC === "true"` (default OFF). |
| [.env.example](../../.env.example) | Documentadas `BACKEND_IMAGE_PROXY_FALLBACK_ENABLED` e nova semântica de `SERVE_UPLOADS_STATIC`. |
| **Testes novos** | [tests/vehicle-images/vehicle-images.controller.test.js](../../tests/vehicle-images/vehicle-images.controller.test.js) (24 cenários), [tests/public/public-seo-sitemap-cache.test.js](../../tests/public/public-seo-sitemap-cache.test.js) (8 cenários). |

### Política nova

**`/api/vehicle-images?key=...`:**

- Com `R2_PUBLIC_BASE_URL` (ou `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`): 302 → `${base}/${key encoded}`. Headers: `Cache-Control: public, max-age=3600`, `X-Vehicle-Images-Source: redirect-r2`, `Referrer-Policy: no-referrer`.
- Sem R2 público e fallback OFF: 404 com `Cache-Control: public, max-age=60`, `X-Vehicle-Images-Source: no-public-base`. Sem chamar SDK.
- Sem R2 público e fallback ON: streaming legado (SDK + buffer + send) com `X-Vehicle-Images-Source: backend-stream-fallback`. Loga warning a cada hit.
- Key inválida: 400 com `Cache-Control: no-store`. Sem chamar SDK.

**Sitemap:**

- `GET /api/public/seo/sitemap` (XML): cache forte
- `GET /api/public/seo/sitemap.json`: cache forte
- `GET /api/public/seo/sitemap/type/:type`: cache forte (antes: nenhum)
- `GET /api/public/seo/sitemap/region/:state`: cache forte (antes: nenhum)
- Erros 4xx/5xx: `no-store` (mantido)
- Limite de URLs preservado em 50 000 — sem mudar SEO.

## Envs a setar no Render

| Env | Valor recomendado | Efeito |
| --- | --- | --- |
| `R2_PUBLIC_BASE_URL` | `https://pub-662ff7f9e6a946168e27ca660899bc3f.r2.dev` | habilita 302 redirect |
| `BACKEND_IMAGE_PROXY_FALLBACK_ENABLED` | `false` (omitir = false) | mantém origin protegido |
| `SERVE_UPLOADS_STATIC` | `false` (omitir = false) | impede `/uploads` static |

## Validação com curl (após deploy)

### Redirect `/api/vehicle-images`

```bash
curl -I "https://carros-na-cidade-core.onrender.com/api/vehicle-images?key=vehicles/alguma-chave.webp"
```

Esperado:
```
HTTP/1.1 302 Found
Location: https://pub-662ff7f9e6a946168e27ca660899bc3f.r2.dev/vehicles/alguma-chave.webp
Cache-Control: public, max-age=3600
X-Vehicle-Images-Source: redirect-r2
Referrer-Policy: no-referrer
```

### Sitemaps com cache forte

```bash
for path in \
  /api/public/seo/sitemap \
  /api/public/seo/sitemap.json \
  /api/public/seo/sitemap/type/estado \
  /api/public/seo/sitemap/region/sp; do
  echo "== $path =="
  curl -sI "https://carros-na-cidade-core.onrender.com$path" | grep -i cache-control
done
```

Esperado em cada uma:
```
cache-control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800
```

## Validação no Render Metrics

1. **Antes do deploy:** screenshot de `carros-na-cidade-core → Metrics → Outbound Bandwidth` em "Last 1h" e "Last 24h".
2. **Após deploy:** aguardar 30–60 min.
3. **Critério de sucesso:** inclinação cai de **GB/hora para MB/hora**.
4. Conferir **CPU/Memory** — redirect remove o buffer R2 da RAM; memória deve cair também.
5. Após 24h: comparar Last 24h vs. 24h anteriores. Esperado: queda agressiva no eixo HTTP Responses.

## Riscos

| Risco | Mitigação |
| --- | --- |
| `R2_PUBLIC_BASE_URL` esquecido no Render | 404 leve em vez de fluxo legado — visível em staging antes de prod |
| Anúncios antigos com `/api/vehicle-images?key=` linkados em emails/marketing | Browser recebe 302 → CDN. Funciona transparente. |
| CDN R2 fora do ar | `BACKEND_IMAGE_PROXY_FALLBACK_ENABLED=true` → volta a streamar. Bandwidth Render aumenta enquanto ligado. |
| Sitemap precisa atualizar em tempo real | Cache 1h no browser; CDN/edge invalidate via deploy (muda artefato). |

## Plano de rollback

| Mudança | Reverso |
| --- | --- |
| 302 redirect | `BACKEND_IMAGE_PROXY_FALLBACK_ENABLED=true` (apenas env, sem deploy de código) |
| Cache forte sitemap | `git revert` do commit; volta para 60s/300s/sem cache |
| `/uploads` default OFF | `SERVE_UPLOADS_STATIC=true` no Render (apenas env) |

Nenhuma mudança é destrutiva. Trigger temporário do banco continua intocado. Frontend continua intocado.

## Próximos passos se o backend continuar subindo após E1+E2

A auditoria identificou outros vetores que ficaram **fora do escopo deste PR** (combinados em ordem decrescente de impacto provável):

1. **Bot blocklist por User-Agent.** Listar Ahrefs, Semrush, Bytespider, PetalBot, BLEXBot, DotBot, DataForSeoBot etc. e responder 429 com `Retry-After` longo. Controlado por `BAD_BOTS_BLOCKED=true`. Não bloqueia Googlebot/Bingbot.
2. **Rate limit específico em `/api/ads*` e `/api/public/cities/:slug*`.** Hoje só existe global 1000/15min — bot pode bater 1.1 req/s sustentado.
3. **Reduzir payload `/api/ads` em listagem.** Devolver só thumbnail/título/preço/slug; mover descrição/telefone/vendor para `/api/ads/:id`.
4. **Whitelist de query params no `cacheGet`.** Hoje `varyBy=["query"]` permite cache key explosion por params lixo.
5. **Render Private Network.** Frontend SSR fala com backend via URL pública hoje; configurar URL interna entre serviços do mesmo workspace zera o bandwidth interno.

Cada item é independente. Recomendo medir após E1+E2 e só atacar o próximo se os números ainda não bateram.
