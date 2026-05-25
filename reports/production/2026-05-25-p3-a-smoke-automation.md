# Relatório final — P3-A (Smoke Automation)

**Data:** 2026-05-25
**Branch / commit:** `main` / `0a561c46`
**Escopo:** automatizar o smoke público em GitHub Actions + ampliar
diagnostics.

## 1. Workflow criado

`.github/workflows/public-contract-smoke.yml`

| Item | Valor |
|------|-------|
| Schedule UTC | `15 6 * * *` e `15 18 * * *` |
| Horário BRT | 03:15 (pós-deploy noturno) e 15:15 (pico de tráfego) |
| Manual via `workflow_dispatch` | sim, com inputs `base_url` (default `https://www.carrosnacidade.com`) e `verbose` |
| Runtime | `ubuntu-latest`, timeout 10 min |
| Checkout | sparse (só `scripts/smoke/...` + runbook) — cold start ~5s |
| Node | 20 (via `actions/setup-node@v4`) |
| Annotations | sim — `::error::`, `::group::`, Job Summary markdown |
| Concurrency | `cancel-in-progress: false` (cron e dispatch não se atropelam) |

### Validação do critério "roda manualmente com sucesso"

Run #26408030466 — disparado via `gh workflow run "Public Contract Smoke" --ref main`:

- ✅ Smoke público (contrato) **em 26s**
- ✅ todos os steps verdes (Checkout, Setup Node 20, Run smoke, Job summary)
- ✅ Annotation summary: `### ✅ Smoke público OK contra https://www.carrosnacidade.com`
- ❗ Warning informativo do GitHub: "Node.js 20 actions deprecated em set/2026" — `actions/checkout@v4` e `actions/setup-node@v4` são as versões mais recentes; warning não bloqueia, só sinaliza migração futura para o ecossistema GitHub.

Link: <https://github.com/aguinaldodiversos-lgtm/carros-na-cidade-core/actions/runs/26408030466>

## 2. Smoke ampliado

O script agora cobre — qualquer destes é hard-fail:

| Categoria | Mecanismo |
|-----------|-----------|
| Status HTTP errado | `expected: [200]` / `[404]` por rota |
| String proibida | `findForbidden(html)` + snippet de até 200 chars |
| Fallback fake | `findFallbackFake(html)` (`id:999001`, T-Cross slug) |
| `R$ 0` fake | regex `/R\$\s?0(?![0-9,])/` (ignora `R$ 0,99`) |
| Soft-404 em `/veiculo/*` 200 | regex em `<title>`/`<h1>`/`<h2>` **após** stripar `<script>` (ignora payload Flight do Next 14) |
| Href `/veiculo/*` quebrado | `vehicle-status:<href> ≠ 200` |
| `x-middleware-ad: passed-valid` | **hard-fail** (P3-A) — em anúncio extraído de catálogo, header deve estar presente E com valor `passed-valid`. Sem isso, middleware não rodou. |
| Cidade esperada ausente | `expectCityName`: body de `/carros-em/atibaia-sp` deve mencionar `"Atibaia"` |
| Cidade indevida no `<title>` | `forbidCityInTitle`: title de Atibaia não pode conter `"São Paulo"` antes do nome esperado |

### Output

- **PASS:** uma linha; sem detail (a menos que `--verbose`).
- **FAIL:** uma linha + bloco `reason= status= hits= snippet= extra=`. No GH Actions, vira `::error title=public-contract-smoke FAIL::...` anotação inline + Job Summary markdown com tabela.

### Flags / env

| Flag CLI | Env equivalente | Efeito |
|----------|-----------------|--------|
| `--base=URL` | `BASE_URL` | URL alvo |
| `--verbose` | `SMOKE_VERBOSE=1` | detail em todas as checks |
| `--github` | `SMOKE_GITHUB=1` ou `GITHUB_ACTIONS=true` | annotations + step summary |
| `--json` | — | report machine-readable |

## 3. Resultado de produção

| Quando | Onde | Resultado |
|--------|------|-----------|
| Pré-commit (local) | Notebook do dev | `91/91` ✅ |
| Pós-deploy (manual local) | Notebook do dev | `91/91` ✅ — transcript em [`reports/production/2026-05-25-p3-a-smoke-pos-deploy.txt`](2026-05-25-p3-a-smoke-pos-deploy.txt) |
| Workflow dispatch | GitHub Actions runner | `91/91` ✅ (run 26408030466, 26s) |

A contagem subiu de 70 → 91 pelos checks novos:

- +12 checks territoriais (`expectCityName` + `forbidCityInTitle` em 6 rotas territoriais);
- +7 checks de soft-404 (1 por href de veículo aberto);
- +2 checks `expectCityName` em `/simulador-financiamento/sao-paulo-sp` e `/tabela-fipe/sao-paulo-sp`.

## 4. Documentação

Runbook completamente reescrito em
[`docs/runbooks/public-contract-smoke-cron.md`](../../docs/runbooks/public-contract-smoke-cron.md):

- §1 — o que o script verifica (checklist completo)
- §2 — como rodar local (flags, env)
- §3 — como rodar manualmente no GH Actions
- §4 — agendamento atual (tabela UTC/BRT)
- §5 — como interpretar falhas (mapa `reason → primeiro ponto de investigação`)
- §6 — matriz "quando bloquear deploy vs warning"
- §7 — como desativar 1 horário ou tudo
- §8 — histórico

## 5. Critérios de aceite

| # | Critério | Status |
|---|----------|--------|
| 1 | Workflow criado | ✅ `.github/workflows/public-contract-smoke.yml` |
| 2 | Workflow roda manualmente com sucesso | ✅ run 26408030466 em 26s |
| 3 | Schedule configurado | ✅ 2x/dia UTC (`15 6` e `15 18`) |
| 4 | Smoke continua 70/70 verde em prod | ✅ 91/91 (com checks novos) |
| 5 | Logs claros para diagnosticar falha | ✅ snippet+reason+hits+annotations |
| 6 | Documentação atualizada | ✅ runbook reescrito |
| 7 | Nenhuma alteração visual | ✅ zero arquivos do app modificados |
| 8 | Commit + push para main | ✅ commit `0a561c46`, push completo |

## 6. Restrições respeitadas

- ✅ Sem mudança em layout.
- ✅ Sem mudança em contrato comercial.
- ✅ Sem IA / financiamento / FIPE / ranking / UX nova.
- ✅ Sem DML.
- ✅ `dealer_name` mantido como está (cleanup adiado para P3-B).
