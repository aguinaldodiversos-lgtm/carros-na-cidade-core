# Cobertura (Vitest), integração e smoke de runtime

Este documento alinha os itens **14–18** do roadmap: baseline de cobertura com limiares, testes priorizados por risco, integração com Postgres, E2E enxuto e smoke contra API (e alinhamento com CI).

## 14 — Cobertura (backend e frontend)

### Backend (raiz)

- **Comando:** `npm run test:coverage` (equivale a `vitest run --exclude tests/integration/** --coverage`).
- **Escopo medido:** `src/modules/**`, `src/shared/**`, `src/infrastructure/**` (workers e entrypoints fora desse recorte não entram no denominador).
- **Relatórios:** `coverage/backend/` (texto no terminal + `json-summary` + HTML).
- **Limiares:** definidos em `vitest.config.js` (`lines`, `branches`, `functions`, `statements`). A CI falha se a cobertura **cair abaixo** desses valores — ajuste os números de forma consciente quando expandir testes ou excluir ficheiros.

### Frontend (`frontend/`)

- **Comando:** `npm run test:coverage` dentro de `frontend/`.
- **Escopo:** `lib/**`, `services/**` (UI e rotas Next não entram no recorte; E2E cobre fluxos críticos no browser).
- **Relatórios:** `coverage/frontend/`.
- **Limiares:** `frontend/vitest.config.ts`.

### `npm test` vs `test:coverage`

- Desenvolvimento rápido: `npm test` (raiz) / `npm test` (frontend) sem relatório de cobertura.
- Gate de regressão de cobertura: use `test:coverage` (é o que a **CI** executa nos jobs backend e frontend).

## 15 — Prioridade por risco (referência)

| Área                       | Cobertura atual típica                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Pagamentos                 | Testes unitários em `tests/payments/` (mapeamento `resolveSubscriptionStatus` / `resolveExpiryDate` usado no webhook). |
| Auth / refresh             | Integração em `ads-pipeline.integration.test.js` (login, refresh, logout invalida refresh).                            |
| Publicar anúncio           | Integração (`createAdNormalized`, `ads.service.show`) + E2E (`e2e/main-flow`, `10-login-ad-publish`).                  |
| BFF `/api/painel/anuncios` | Integração (`listOwnedAds`, `getOwnedAd`, isolamento A/B); E2E exercita o painel com browser.                          |

## 16 — Integração (`tests/integration/`)

- Variáveis `AI_*` (gateway local vs API paga): [docs/configuration/ai-environment.md](../configuration/ai-environment.md).
- Ficheiro principal: `ads-pipeline.integration.test.js` (Postgres real).
- Execução local completa: `npm run test:integration:ads:full` (sobe Docker, migrations, seed mínimo).
- Espelho CI (Postgres já acessível): `npm run ci:integration-ads`.
- Detalhes: [integration-ads.md](./integration-ads.md).

Além dos cenários já documentados, a suíte valida **listagem do painel com múltiplos anúncios** na mesma conta (todos os IDs criados no teste aparecem em `listOwnedAds`).

## 17 — E2E Playwright — smoke

- **Smoke (rápido, regressões frequentes):** ficheiros que marcam testes com `{ tag: "@smoke" }` (ex.: redirect legado `/painel/anuncios/novo`, fluxo PF principal em `main-flow.spec.ts`).
- **Comando:** na raiz `npm run e2e:smoke` ou em `frontend`: `npm run test:e2e:smoke` (`playwright test --grep @smoke`).
- Fluxos longos (checkout, PJ crítico, publish completo alternativo): `test:e2e:publish`, `test:e2e:main`, ou suíte completa `npm run test:e2e`.
- Documentação geral: [e2e.md](./e2e.md).

A CI **não** executa Playwright por defeito (tempo e dependências de browser); o smoke fica para pré-release ou job opcional.

## 18 — Smoke de runtime (API) e alinhamento com CI

### Script `npm run smoke`

O script `scripts/smoke.mjs` valida a API em execução (health, listagens, auth sanity opcional, métricas opcional).

| Variável                                | Papel                                                    |
| --------------------------------------- | -------------------------------------------------------- |
| `BASE_URL`                              | Base da API (default `http://localhost:4000`).           |
| `SMOKE_TIMEOUT_MS`                      | Timeout por pedido (default 8000).                       |
| `SMOKE_RETRIES`                         | Tentativas (default 1).                                  |
| `SMOKE_ORIGIN`                          | Header `Origin` se necessário.                           |
| `SMOKE_AUTH`                            | `true`/`false` — sanity de rotas de auth (default true). |
| `SMOKE_METRICS`                         | Probar `/metrics` (default true).                        |
| `SMOKE_MAX_LATENCY_MS`, `SMOKE_BURST_*` | Pressão/latência em cenários avançados.                  |

**Exemplo (API local):**

```bash
# Terminal 1: npm run dev (ou start) na raiz
# Terminal 2:
set BASE_URL=http://127.0.0.1:4000
npm run smoke
```

Smoke **não** substitui o build do Next; para o portal, a CI já valida **lint, typecheck, testes com cobertura e build** no job frontend. Para validar frontend + API juntos localmente, use E2E (`e2e:prepare` + backend + `npm run dev` no frontend) conforme [e2e.md](./e2e.md).

### O que a CI garante hoje

| Job         | Validação                                                                    |
| ----------- | ---------------------------------------------------------------------------- |
| Backend     | ESLint, `test:coverage`, `audit:contract`, `audit:integrity`, `audit:clones` |
| Integration | Postgres service + `ci:integration-ads`                                      |
| Frontend    | ESLint, typecheck, `test:coverage`, `audit:project`, Next build              |

---

Atualize os limiares de cobertura quando o baseline subir de forma estável (após novos testes), para manter o gate útil e evitar falsos positivos.
