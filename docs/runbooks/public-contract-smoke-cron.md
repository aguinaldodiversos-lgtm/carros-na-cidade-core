# Smoke público — agendamento e operação

Este runbook documenta **como** rodar, interpretar e reagir ao
`public-contract-smoke.mjs` em produção. A versão automatizada via
GitHub Actions está ativa desde **P3-A (2026-05-25)**.

> **Status atual (2026-05-25):** smoke roda **2x/dia em UTC** via
> `.github/workflows/public-contract-smoke.yml`. Também é executado
> manualmente em PRs sensíveis ao contrato público (P0/P1/P2) e
> imediatamente após cada deploy.

## 1. O script

`scripts/smoke/public-contract-smoke.mjs` — Node 20+, zero deps.

Cobertura — qualquer uma destas condições FALHA o job:

- status HTTP errado em qualquer das 15 rotas críticas;
- string proibida no HTML público (Teste, Test, DeployModel, Seed,
  Worker, Alerta, Fake, Dummy, "SÆo Paulo", "backend irá incorporar",
  "features[]", "has_photo", "plano Pro/Start", `R$ 0` fake);
- `R$ 0` fake (regex específica que ignora `R$ 0,99`);
- fallback fake (T-Cross id 999001 / slug `volkswagen-t-cross-2022-2023`);
- cidade não-esperada no body (ex.: `/carros-em/atibaia-sp` sem mencionar
  "Atibaia") ou cidade hardcoded no `<title>` (ex.: title de Atibaia
  contendo "São Paulo" antes do nome da cidade);
- href `/veiculo/*` extraído de catálogo respondendo != HTTP 200;
- soft-404: `/veiculo/*` 200 com texto "Veículo não encontrado" no
  `<title>`/`<h1>`/`<h2>` visível (ignora payload Flight do Next);
- ausência ou valor errado do header `x-middleware-ad: passed-valid`
  em anúncio real (passou a ser hard-fail em P3-A — antes era informativo).

## 2. Como rodar local

```bash
# Default: prod (https://www.carrosnacidade.com)
node scripts/smoke/public-contract-smoke.mjs

# Base custom
node scripts/smoke/public-contract-smoke.mjs --base=https://staging.carrosnacidade.com

# Saída JSON (pra parser/CI)
node scripts/smoke/public-contract-smoke.mjs --json

# Detalhe em todas as checks (mesmo as PASS)
node scripts/smoke/public-contract-smoke.mjs --verbose

# Modo GitHub Actions (annotations ::error::, step summary markdown)
# — ativado automaticamente quando GITHUB_ACTIONS=true
node scripts/smoke/public-contract-smoke.mjs --github
```

Env equivalente para containers:

- `BASE_URL` — alternativa a `--base=`
- `SMOKE_VERBOSE=1` — alternativa a `--verbose`
- `SMOKE_GITHUB=1` — alternativa a `--github`

Exit codes:

- `0` — todas as checks críticas passaram.
- `1` — pelo menos uma falha crítica (deploy quebrou contrato).
- `2` — erro de execução (rede, DNS, timeout).

## 3. Como rodar manualmente no GitHub Actions

1. Abrir **Actions → Public Contract Smoke**:
   <https://github.com/aguinaldodiversos-lgtm/carros-na-cidade-core/actions/workflows/public-contract-smoke.yml>
2. Clicar em **Run workflow**.
3. Opcionalmente trocar `BASE_URL` (ex.: para apontar para um ambiente
   de staging) e/ou ligar `verbose`.
4. Clicar em **Run workflow** verde. O run aparece em ~5s.

Cada execução fica no histórico — ótimo para investigação retroativa.

## 4. Agendamento atual

`.github/workflows/public-contract-smoke.yml`:

| Quando | Cron (UTC) | Horário BRT | Por quê |
|--------|------------|-------------|---------|
| Madrugada | `15 6 * * *` | 03:15 | Após janela de deploy noturno automático, antes do tráfego começar. |
| Tarde | `15 18 * * *` | 15:15 | Pico de tráfego — pega regressões de deploys feitos durante o dia. |

Minuto `:15` (não `:00`) reduz contention com cron jobs mais comuns no
runner shared do GitHub.

## 5. Como interpretar falhas

O job emite **annotations inline** (`::error::`) e um **Job Summary**
markdown com tabela das falhas. No log:

```
[FAIL] /carros-em/atibaia-sp — body menciona "Atibaia" (reason=expected-city-missing extra=city=Atibaia)
```

Campos no `detail`:

| Campo | Significado |
|-------|-------------|
| `reason=` | causa raiz (`status-mismatch`, `forbidden-string`, `fallback-fake`, `expected-city-missing`, `city-hardcoded-in-title`, `soft-404-on-200`, `header-absent`, `header-wrong-value`). |
| `status=` | HTTP recebido. |
| `hits=` | IDs dos padrões proibidos encontrados (ex.: `dirty-deploy-model,price-zero-fake`). |
| `snippet=` | Trecho ~200 chars do HTML em volta da match — útil para distinguir falso positivo. |
| `extra=` | dados específicos (header recebido, cidade esperada, etc). |

### Mapa rápido de diagnóstico

| Reason | Onde investigar primeiro |
|--------|--------------------------|
| `status-mismatch` em rota crítica | Deploy quebrado, middleware em loop, fly-out de feature flag. Cheque o Render dashboard. |
| `forbidden-string` com `hits=dirty-*` | Backend está liberando ad de teste/DeployModel/Seed no payload público. Conferir `DIRTY_AD_FIELDS_SQL` e `loadBrandDictionary`. |
| `forbidden-string` com `hits=price-zero-fake` | Algum card está renderizando `R$ 0`. Conferir se algum componente novo não migrou para `formatPricePublic`. |
| `fallback-fake` | O fallbackHero T-Cross ressuscitou. Procurar por `id: 999001` ou `volkswagen-t-cross-2022-2023` no diff recente. |
| `expected-city-missing` | A rota territorial está caindo no default territorial — verificar `app/carros-em/[slug]/page.tsx` e `app/carros-usados/regiao/[slug]/page.tsx`. |
| `city-hardcoded-in-title` | Algum template SEO regrediu para `"São Paulo"` hardcoded. Conferir `cityNameFromVehicle` e helpers em `lib/seo/`. |
| `soft-404-on-200` | Middleware `ad-detail-gate` não está mais comitando 404 real. Conferir `frontend/middleware.ts` e o fix do commit `093969a6`. |
| `header-absent` em anúncio real | O middleware não rodou no path do anúncio. Conferir matcher do `middleware.ts` e cache do Render. |
| `header-wrong-value` | Anúncio passou pelo middleware mas falhou na validação — provável dirty data novo. Olhar logs do middleware. |

## 6. Quando bloquear deploy vs. tratar como warning

Hoje **todas as falhas do smoke são críticas** (`severity: critical`).
Não há checks com `severity: warn` ativos. Mas se um operador
precisar avaliar:

| Cenário | Bloqueia deploy? | Justificativa |
|---------|------------------|---------------|
| 1 falha crítica única, reproduzível em segundo run | **Sim.** Reverter o último deploy. | Contrato público quebrado é prejuízo direto a SEO e confiança. |
| 1 falha intermitente (passa no re-run manual) | Não — investigar como tarefa P-prox. | Pode ser timeout esporádico do edge / cold-start do Render. |
| Múltiplas falhas que SUMIRAM no run seguinte sem deploy entre eles | Não — registrar no incident log e monitorar. | Provável estado transiente do origin. Se >3 vezes/semana, virar incidente. |
| Falha com `reason=status-mismatch status=000` | Não — confirmar primeiro com `curl` direto. | `000` = DNS/timeout no runner do GitHub. Se prod responde via `curl`, é problema do runner. |
| Falha em `header-absent` em UM href apenas | **Sim**, se reproduzível. | Provável: cache stale do Cloudflare/Render servindo HTML antigo. Disparar purge e re-run. |
| 50%+ dos hrefs com `header-absent` | **Sim — pager imediato.** | Middleware não está rodando. Provavelmente o matcher quebrou ou o middleware foi removido por engano. |

## 7. Como desativar temporariamente

- **Desligar 1 horário:** comentar uma das linhas `- cron: ...` no
  workflow.
- **Desligar tudo:** trocar `on.schedule` por `on.workflow_dispatch:` só.
- **Desligar matando o arquivo:** renomear
  `.github/workflows/public-contract-smoke.yml` → `.disabled.yml`.

Em qualquer caso, abrir issue documentando o motivo e a data prevista
de reativação.

## 8. Histórico

- **2026-05-25 (P3-A)** — Smoke automatizado em GitHub Actions com
  2 runs diários em UTC. Output ganhou snippets do HTML, GitHub
  annotations, `--github` flag, soft-404 detector (ignorando Flight
  payload), expected-city/forbidden-city, e o header
  `x-middleware-ad: passed-valid` virou hard-fail em anúncios reais.
- **2026-05-25 (P2-E)** — Criado `public-contract-smoke.mjs`. Smoke
  manual; runbook listava 3 opções (Render Scheduled Job, GitHub
  Actions, cron externo) sem ativar nenhuma.
