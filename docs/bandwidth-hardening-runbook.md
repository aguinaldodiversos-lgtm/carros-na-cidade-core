# Runbook — Bandwidth Hardening pós-incidente

Status: ativo desde 2026-05-14.
Donos: aguinaldo.diversos@gmail.com.

Este runbook complementa os existentes (`backend-bandwidth-incident.md`,
`backend-emergency-bandwidth-guard.md`, `backend-404-storm-and-node-bot.md`,
`vehicle-images-bandwidth-incident.md`).

Cobre o PR de hardening que transforma o hotfix emergencial em arquitetura
sustentável: autenticação interna estrita, Private Network do Render,
payload slim de `/api/ads`, `allowedQueryKeys` nas rotas pesadas, kill
switch + checklist de reativação do sitemap.

---

## 1. Variáveis de ambiente

### Backend (carros-na-cidade-core)

| Env | Default | Função |
| --- | --- | --- |
| `INTERNAL_API_TOKEN` | (vazio) | Token comparado via `timingSafeEqual` contra `X-Internal-Token`. UA `cnc-internal/1.0` sem token = 429. |
| `BAD_BOTS_BLOCKED` | `true` | Bloqueia crawlers SEO/AI e clients HTTP genéricos. |
| `LEGACY_BFF_COMPAT` | `false` | **Rollback emergencial.** Quando `true`, UA `node` + `X-Cnc-Client-Ip` ainda passa. Default OFF — alvo é remover de vez no próximo PR. |
| `SITEMAP_PUBLIC_ENABLED` | `false` | Kill switch dos sitemaps públicos (4 endpoints). |
| `BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED` | `true` em janela de triagem, depois `false` | Logs agregados em stdout, sem PII (IP hashado, UA categorizado, body nunca logado). |
| `PUBLIC_404_STORM_GUARD_ENABLED` | `true` | 404 storm guard por (IP, UA). |
| `SERVE_UPLOADS_STATIC` | `false` em prod | Liga `/uploads` via `express.static`. Default OFF. |
| `BACKEND_IMAGE_PROXY_FALLBACK_ENABLED` | `false` | Fallback de imagem via origin (caro). |

### Frontend (carros-na-cidade-portal)

| Env | Server/Client | Função |
| --- | --- | --- |
| `INTERNAL_API_TOKEN` | server-only | Token enviado em `X-Internal-Token` para todo fetch SSR/BFF. Idêntico ao backend. |
| `INTERNAL_BACKEND_API_URL` | server-only | URL da Private Network do Render. Quando setada, fetch server-side resolve via ela (reduz bandwidth público). |
| `BACKEND_INTERNAL_URL` | server-only | Alias aceito (resolução cai em fallback público se ambas vazias). |
| `AUTH_API_BASE_URL`, `BACKEND_API_URL`, `API_URL` | server-only (mas hoje públicas) | URL pública do backend. Fallback quando `INTERNAL_BACKEND_API_URL` ausente. |
| `NEXT_PUBLIC_API_URL` | client | URL pública usada por fetches do browser (autocomplete, leads). NUNCA contém token. |

**Atenção:** `INTERNAL_API_TOKEN`, `INTERNAL_BACKEND_API_URL` e
`BACKEND_INTERNAL_URL` **não podem ter prefixo `NEXT_PUBLIC_*`** —
o helper `internal-backend-headers.ts` é `import "server-only"` justamente
para o Next abortar o build se algum client importar.

---

## 2. Configurar a Private Network do Render

Reduz outbound bandwidth eliminando tráfego frontend↔backend pela internet
pública (entre services Render do mesmo workspace).

### Passos

1. **Render Dashboard > Service `carros-na-cidade-core` (backend)**
   - Aba `Settings` → seção `Private network`.
   - Anotar o hostname interno (ex.: `carros-na-cidade-core.internal`) e a
     porta (default `4000`). **Não invente o hostname** — Render mostra o
     valor exato no painel.
2. **Render Dashboard > Service `carros-na-cidade-portal` (frontend) > Environment**
   - Adicionar:
     ```
     INTERNAL_BACKEND_API_URL=http://<hostname-interno>:<porta>
     ```
   - Confirmar que `INTERNAL_API_TOKEN` está setado e é **idêntico** ao
     do backend.
   - Salvar e fazer redeploy.
3. **Validação imediata após deploy**
   - Hit em `https://<portal>/api/diag` deve mostrar:
     ```json
     "privateNetwork": { "active": true },
     "envVarsPresent": { "INTERNAL_BACKEND_API_URL": true, "INTERNAL_API_TOKEN": true }
     ```
   - Probes `adsSearch_SP`, `publicHome`, `backendHealth` devem retornar
     `ok: true`, `status: 200`, e o `url` deve apontar para o hostname
     interno.

### Como confirmar que o tráfego está realmente passando pela Private Network

- Painel Render → service backend → aba `Metrics` → `Bandwidth`. Deve
  cair perceptivelmente (a janela 1h pré-deploy vs 1h pós-deploy).
- Logs do backend (busque categoria `internal` em
  `bandwidth-diagnostics`): top user agents deve passar a ser dominado
  por `bot:cnc-internal`.

---

## 3. Como validar que o frontend SSR autentica corretamente

```bash
# 1. Backend bloqueia UA node público (com BAD_BOTS_BLOCKED=true)
curl -I -H "User-Agent: node" https://carros-na-cidade-core.onrender.com/api/ads
# Esperado: HTTP/2 429

# 2. Backend bloqueia UA node + X-Cnc-Client-Ip (compat fraca OFF — LEGACY_BFF_COMPAT=false)
curl -I \
  -H "User-Agent: node" \
  -H "X-Cnc-Client-Ip: 203.0.113.42" \
  https://carros-na-cidade-core.onrender.com/api/ads
# Esperado: HTTP/2 429

# 3. Chamada interna autenticada passa
curl -I \
  -H "User-Agent: cnc-internal/1.0" \
  -H "X-Internal-Token: <valor real>" \
  https://carros-na-cidade-core.onrender.com/api/ads
# Esperado: HTTP/2 200

# 4. Chamada interna SEM token é bloqueada
curl -I \
  -H "User-Agent: cnc-internal/1.0" \
  https://carros-na-cidade-core.onrender.com/api/ads
# Esperado: HTTP/2 429 (bot blocker bloqueia; é o caminho normal —
#   `cnc-internal/1.0` não está na blocklist mas tambem nao passa sem
#   token. O codigo trata como UA desconhecido → passa o bot blocker,
#   mas se houver outro filtro pode 401/403)

# 5. Chamada interna com token errado é bloqueada
curl -I \
  -H "User-Agent: cnc-internal/1.0" \
  -H "X-Internal-Token: errado" \
  https://carros-na-cidade-core.onrender.com/api/ads
# Esperado: HTTP/2 429 (mesmo caminho — token mismatch)

# 6. Chrome humano continua passando
curl -I \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120" \
  https://carros-na-cidade-core.onrender.com/api/ads
# Esperado: HTTP/2 200

# 7. Bots da blocklist sempre bloqueados
curl -I -H "User-Agent: AhrefsBot/7.0" https://carros-na-cidade-core.onrender.com/api/ads
# Esperado: HTTP/2 429

# 8. Sitemap kill switch (SITEMAP_PUBLIC_ENABLED=false)
curl -I https://carros-na-cidade-core.onrender.com/api/public/seo/sitemap
# Esperado: HTTP/2 503 + Retry-After: 3600 + payload mínimo
```

### Sinais nos logs do Render

- Top user agents em `bandwidth-diagnostics` deve estar dominado por
  `bot:cnc-internal` (frontend) + `browser:chrome` (usuários reais).
- Ausência de `other:node` em `/api/ads*` confirma que a compat fraca
  realmente saiu de cena.
- Warning único `[bot-blocker] UA cnc-internal/1.0 recebido SEM
  X-Internal-Token valido em producao` indica problema de sincronização
  de envs — verificar `INTERNAL_API_TOKEN` em ambos os serviços.

---

## 4. Como validar redução de bandwidth

| Métrica | Antes (pre-fix) | Pós-emergency | Pós-hardening (este PR) |
| --- | --- | --- | --- |
| Backend Outbound 1h | GB/h | MB/h | MB/h (estável; idealmente menor) |
| Frontend Outbound 1h | GB/h | MB/h | MB/h (Private Network reduz mais) |
| Payload médio `/api/ads` (12 ads) | ~110 KB | ~110 KB | ~30-50 KB (slim) |

### Onde olhar

1. Render Dashboard → cada service → Metrics → Bandwidth → janela `Last 1h`.
2. Logs do backend: `BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED=true` por
   30-60min e ver `total_bytes` por agregado de 60s.
3. Frontend `/api/diag`: campos `clientIp`, `probes.adsSearch_SP.bodyPreview`.

---

## 5. Reativação do sitemap público (`SITEMAP_PUBLIC_ENABLED=true`)

**Não reativar enquanto o portal estiver em fase "desenvolvimento".** Este
runbook documenta o checklist que precisa estar 100% verde antes do flip.

### Pré-condições

- [ ] Site frontend pronto para indexação ampla (todas as páginas
      regionais funcionando, sem 404 em rotas comuns, robots.txt do
      portal Allow em `/cidade/`, `/comprar`, etc.).
- [ ] Backend continua com robots.txt `Disallow: /` e header global
      `X-Robots-Tag: noindex, nofollow, noarchive` (já no código —
      [src/app.js:178-205](../src/app.js)).
- [ ] Sitemap index do portal (`frontend/app/sitemap.xml/route.ts`) já é
      a fonte SEO oficial. Backend `/api/public/seo/sitemap*` é apenas
      data source interno — nunca foi pensado como canonical.
- [ ] Confirmar `BAD_BOTS_BLOCKED=true` para não receber crawler-storm
      no flip.
- [ ] Confirmar `PUBLIC_404_STORM_GUARD_ENABLED=true`.
- [ ] Validar Cache-Control quando ON: `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800`
      ([src/modules/public/public-seo.controller.js:30-31](../src/modules/public/public-seo.controller.js)).
- [ ] Limite default 50k URLs por request — testar payload máximo para
      garantir que não estoura 10 MB no pior caso.
- [ ] Existe rate limit específico (`sitemapRateLimit`, 5 req/min) em
      [src/app.js:254](../src/app.js) — confirmar que continua ativo.

### Procedimento de flip

1. Subir `SITEMAP_PUBLIC_ENABLED=true` em janela de baixo tráfego.
2. Monitorar Render bandwidth por 30min.
3. Hit em `https://carros-na-cidade-core.onrender.com/api/public/seo/sitemap.xml` deve responder 200 + Cache-Control forte.
4. Hit do portal: `https://<portal>/sitemap.xml` deve continuar funcionando independente do backend.
5. Se bandwidth subir além de MB/h, voltar para `false` imediatamente.

### Rollback do sitemap

```
SITEMAP_PUBLIC_ENABLED=false
```

Volta a responder 503 + Retry-After:3600. Não quebra robots.txt nem o sitemap do portal.

---

## 6. Rollback do PR

Cada peça é controlável independentemente por env. Em caso de regressão de
bandwidth ou tráfego cortado errado:

| Cenário | Rollback |
| --- | --- |
| Frontend SSR cortado em 429 após deploy | `LEGACY_BFF_COMPAT=true` no backend (aceita UA node + X-Cnc-Client-Ip por algumas horas) |
| Token não sincronizado entre services | Verificar `INTERNAL_API_TOKEN` no backend E no frontend Render Environment |
| Private Network inacessível | Remover `INTERNAL_BACKEND_API_URL` do frontend → volta para origin público |
| Slim payload quebrou card específico | Reverter `ads.public.service.js` para `data: normalized` sem chamar `serializeAdsForListing` (1 linha) |
| `allowedQueryKeys` ignorou filtro legítimo | Remover whitelist em `ads.routes.js` ou adicionar o param em `ADS_ALLOWED_QUERY_KEYS` |
| Sitemap reativado mas bandwidth subiu | `SITEMAP_PUBLIC_ENABLED=false` |
| Bot blocker cortando demais | `BAD_BOTS_BLOCKED=false` (último recurso — abre crawler-storm) |
| 404 guard cortando demais | `PUBLIC_404_STORM_GUARD_ENABLED=false` |
| Diagnostics fica pesado nos logs | `BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED=false` |

---

## 7. Sinais de saúde após deploy

### Imediato (5 minutos)

- `/api/diag` retorna `privateNetwork.active: true` (se configurada) e
  probes 200.
- Logs do backend sem flood de warning `UA cnc-internal/1.0 sem token`.
- Bandwidth dos dois services não pulou para GB/h.

### Curto prazo (30 min)

- Top user agents no diagnostics dominado por `bot:cnc-internal` e
  `browser:chrome`.
- Ausência de `other:node` em rotas /api/ads*.
- Cache HIT ratio de /api/ads/list e /api/ads/search se mantém ou
  melhora (allowedQueryKeys → menos cache key explosion).

### Longo prazo (48h)

- Bandwidth estável em MB/h.
- Considerar remover `LEGACY_BFF_COMPAT` por completo (deletar a flag e
  o caminho de bypass).

---

## 8. Referências cruzadas

- Backend bot blocker: [src/shared/middlewares/bot-blocker.middleware.js](../src/shared/middlewares/bot-blocker.middleware.js)
- Internal headers helper (frontend): [frontend/lib/http/internal-backend-headers.ts](../frontend/lib/http/internal-backend-headers.ts)
- URL resolver: [frontend/lib/env/backend-api.ts](../frontend/lib/env/backend-api.ts)
- Slim payload: [src/modules/ads/ads.public-listing.js](../src/modules/ads/ads.public-listing.js)
- Cache middleware (allowedQueryKeys): [src/shared/cache/cache.middleware.js](../src/shared/cache/cache.middleware.js)
- Sitemap kill switch: [src/modules/public/public-seo.controller.js](../src/modules/public/public-seo.controller.js)
- Bandwidth diagnostics: [src/shared/middlewares/bandwidth-diagnostics.middleware.js](../src/shared/middlewares/bandwidth-diagnostics.middleware.js)
- Incidentes anteriores: [backend-bandwidth-incident.md](./backend-bandwidth-incident.md), [backend-404-storm-and-node-bot.md](./backend-404-storm-and-node-bot.md), [vehicle-images-bandwidth-incident.md](./vehicle-images-bandwidth-incident.md)
