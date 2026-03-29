# E2E (Playwright) — portal Carros na Cidade

Testes em `frontend/e2e/`. Validam o fluxo **como usuário real** (browser + API).

## Execução rápida (após subir stack)

```bash
# Terminal 1 — Postgres de teste (opcional; pode usar o mesmo DB do dev)
cd /caminho/carros-na-cidade-core
npm run integration:db:up
npm run integration:db:wait
npm run integration:db:prepare

# Terminal 2 — backend (porta 4000)
# DATABASE_URL apontando para o mesmo Postgres; JWT_* definidos
npm run dev
# (ou node src/index.js)

# Terminal 3 — frontend (porta 3000)
cd frontend
cp .env.local.example .env.local   # se ainda não existir; ajuste NEXT_PUBLIC_API_URL=http://127.0.0.1:4000
npm run dev

# Terminal 4 — E2E
cd frontend
set E2E_BACKEND_API_URL=http://127.0.0.1:4000
set TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/carros_na_cidade_test
set E2E_DATABASE_URL=%TEST_DATABASE_URL%
npx playwright test --reporter=list
```

No Linux/macOS use `export` em vez de `set`.

Na **raiz** do monorepo também existe:

```bash
npm run e2e
```

(executa `npm run test:e2e` no `frontend`).

## Variáveis úteis

| Variável | Função |
|----------|--------|
| `PLAYWRIGHT_BASE_URL` | URL do Next (padrão `http://127.0.0.1:3000`) |
| `E2E_BACKEND_API_URL` | API Express usada pelos asserts `GET /api/ads/search` (padrão `http://127.0.0.1:4000`) |
| `E2E_DATABASE_URL` / `TEST_DATABASE_URL` | Assert SQL em `assertLatestAdPersistedForEmail` (opcional) |
| `E2E_EMAIL` / `E2E_PASSWORD` | Login em `login-ad-publish.spec.ts` (padrão cpf@… / 123456) |
| `E2E_PJ_EMAIL` / `E2E_PJ_PASSWORD` | Futuro fluxo PJ em `critical-pj-flow.spec.ts` |
| `SKIP_E2E_MAIN` | `1` pula o spec principal `main-flow.spec.ts` |
| `PW_START_SERVER=1` | Playwright sobe o Next via `webServer` (ver `frontend/playwright.config.ts`) |

## Specs

| Ficheiro | Conteúdo |
|----------|----------|
| `main-flow.spec.ts` | **PF**: cadastro → painel → wizard → busca API → painel → `/anuncios` → **`/veiculo/[slug]`** |
| `login-ad-publish.spec.ts` | Login fixo → wizard → publicar |
| `login-ad-checkout.spec.ts` | Login → wizard → planos/checkout |
| `anunciar-redirect.spec.ts` | Redirect legado `/painel/anuncios/novo` |
| `critical-pj-flow.spec.ts` | PJ opcional (skipped sem credenciais) |

## Relatório da última execução automatizada

Sem `npm run dev` no frontend, **todos os testes falham** em `ensureDevServerUp` (Next inacessível na porta 3000). Isso é **esperado** em CI sem subir o servidor; localmente suba os três serviços antes de `npx playwright test`.

## Lacunas conhecidas

- **PJ**: fluxo lojista não cobre publicação completa até haver credenciais `E2E_PJ_*` e cenário CNPJ verificado.
- **Mercado Pago / planos**: `login-ad-checkout` depende de rotas de pagamento configuradas.
- **Credenciais locais**: `login-ad-publish` assume utilizador `E2E_EMAIL` existente no backend.
- **FIPE**: wizard depende de API FIPE (via Next); falhas de rede externa quebram o passo de marcas/modelos.

## Integração com CI

Para E2E na pipeline: serviço Postgres, job que inicia API + Next (ou `PW_START_SERVER=1` com `E2E_BACKEND_API_URL` para API remota), artefactos Playwright (`report`, `trace`).
