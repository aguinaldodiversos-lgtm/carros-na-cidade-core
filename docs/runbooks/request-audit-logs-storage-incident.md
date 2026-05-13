# Incidente — request_audit_logs estourou storage do Postgres (Render)

**Data:** 2026-05-13
**Severidade:** P0 (banco suspenso pelo Render por exceder storage).
**Status do fix:** mitigação completa no código; cleanup emergencial documentado abaixo.

## Sintoma

Banco PostgreSQL do Render suspenso. Diagnóstico direto:

| Métrica | Valor |
| --- | --- |
| Banco total | 15 GB |
| `public.request_audit_logs` (total) | 15 GB |
| `request_audit_logs` heap | 12 GB |
| Índices + toast | 3 233 MB |
| Linhas estimadas | 53 617 764 |
| `idx_request_audit_logs_created_at` | 2 075 MB |
| `request_audit_logs_pkey` | 1 155 MB |

O resto do banco é ≪ 1 GB. **Toda a capacidade do plano foi consumida por uma única tabela observacional.**

## Causa raiz

Arquivo: [src/shared/middlewares/httpLogger.middleware.js](../../src/shared/middlewares/httpLogger.middleware.js).

1. **Default invertido.** O middleware lia `REQUEST_AUDIT_LOGS_ENABLED` com fallback hardcoded `"true"`, contrariando o default `false` da flag central em [src/shared/config/features.js](../../src/shared/config/features.js). Em produção Render a env não estava setada → middleware gravava por default.
2. **Sem filtro de path.** Todas as requests viravam linha: `/health`, `/api/vehicle-images/*`, `/uploads/*`, `/favicon.ico`, `/_next/*`, sitemap, assets…
3. **Sem amostragem.** 100 % das 2xx/3xx eram persistidas — sendo a maioria absoluta do tráfego.
4. **Sem retenção.** Nada apagava nunca. A tabela crescia monotonicamente desde o deploy do middleware.

Combinação: a tabela cresceu a ~1 GB / semana até o disco encher.

## O que foi corrigido no código

| Arquivo | Mudança |
| --- | --- |
| [src/shared/middlewares/httpLogger.middleware.js](../../src/shared/middlewares/httpLogger.middleware.js) | Passa a usar `features.requestAuditLogs` (default `false`). Adicionado allow/deny list de paths, amostragem de 2xx/3xx (default 1 %), gravação garantida de 4xx/5xx, truncamento de `path` (512) e `user_agent` (256), bloqueio de `OPTIONS`. |
| [.env.example](../../.env.example) | Documentadas novas envs: `REQUEST_AUDIT_LOGS_ENABLED`, `REQUEST_AUDIT_SAMPLE_SUCCESS_RATE`, `REQUEST_AUDIT_RETENTION_DAYS`. |
| [scripts/maintenance/diagnose-request-audit-logs.mjs](../../scripts/maintenance/diagnose-request-audit-logs.mjs) | Diagnóstico read-only: tamanho, top paths, top user-agents, status, volume diário. |
| [scripts/maintenance/cleanup-request-audit-logs.mjs](../../scripts/maintenance/cleanup-request-audit-logs.mjs) | TRUNCATE controlado (dry-run default). |
| [scripts/maintenance/sql/cleanup-request-audit-logs-emergency.sql](../../scripts/maintenance/sql/cleanup-request-audit-logs-emergency.sql) | Equivalente SQL puro, executável direto via `psql` se o app não estiver subindo. |
| [scripts/maintenance/prune-request-audit-logs.mjs](../../scripts/maintenance/prune-request-audit-logs.mjs) | Retention job em lotes para rodar em cron. |

### Política nova de logs (resumo)

- **Default OFF em produção.** `REQUEST_AUDIT_LOGS_ENABLED=false` deve ser o estado normal.
- **Quando ligado, paths ignorados sempre:** `/health*`, `/ready`, `/live`, `/ping`, `/metrics`, `/favicon.ico`, `/robots.txt`, `/sitemap*.xml`, `/uploads/*`, `/api/vehicle-images/*`, `/static/*`, `/assets/*`, `/images/*`, `/img/*`, `/_next/*`, qualquer URL terminando em `.png/.jpg/.webp/.svg/.css/.js/.map/.woff(2)/.mp4/...`, e qualquer `OPTIONS`.
- **Amostragem:** 2xx/3xx → `REQUEST_AUDIT_SAMPLE_SUCCESS_RATE` (default 0.01 = 1 %). 4xx/5xx → 100 %.
- **Sanitização:** só persistimos `request_id`, `method`, `path` (≤512 chars), `status_code`, `duration_ms`, `ip_address`, `user_agent` (≤256 chars). **Nunca** body, headers, cookies, authorization, tokens.
- **Retenção:** `REQUEST_AUDIT_RETENTION_DAYS` (default 7), aplicada por `prune-request-audit-logs.mjs` em cron diário.

## Plano de mitigação em produção

### Passo 1 — Deploy do middleware corrigido

Deploy normal de `main`. Como a flag passa a ser default `false`, a partir do deploy **nenhuma nova linha** será gravada, mesmo que o restante do procedimento ainda não tenha rodado. Isso para o sangramento imediatamente.

> Se quiser manter audit ligado em produção mesmo após o fix:
> ```
> REQUEST_AUDIT_LOGS_ENABLED=true
> REQUEST_AUDIT_SAMPLE_SUCCESS_RATE=0.01
> REQUEST_AUDIT_RETENTION_DAYS=7
> ```

### Passo 2 — Diagnóstico (antes de truncar)

Render dashboard → reativar storage temporariamente (pagar overage por algumas horas) ou usar o read-replica se houver. Então:

```bash
node scripts/maintenance/diagnose-request-audit-logs.mjs
# ou direto via psql, a partir do .sql para queries puntuais
```

Salvar a saída no incidente: serve de pós-mortem (quais bots/health probes dominavam).

### Passo 3 — Cleanup emergencial

```bash
# Dry-run obrigatório primeiro:
node scripts/maintenance/cleanup-request-audit-logs.mjs

# Apaga:
node scripts/maintenance/cleanup-request-audit-logs.mjs --yes
```

Equivalente SQL (se o app não puder subir por estar suspenso):

```bash
psql "$DATABASE_URL" -f scripts/maintenance/sql/cleanup-request-audit-logs-emergency.sql
```

`TRUNCATE` libera storage imediatamente (heap e índices), diferente de `DELETE`. **Não usar `DELETE FROM request_audit_logs`** — ele preenche o WAL, demora horas e ainda exige `VACUUM FULL` depois.

### Passo 4 — Reativar o banco no Render

Após o TRUNCATE, o Render volta automaticamente (storage abaixo do limite do plano). Se demorar a refletir, rodar `VACUUM ANALYZE public.request_audit_logs;`.

### Passo 5 — Agendar retenção

Criar **Render Cron Job** (ou GitHub Action `schedule`) rodando diariamente:

```bash
node scripts/maintenance/prune-request-audit-logs.mjs --yes
```

## Validação em produção

Após deploy + cleanup:

1. `SELECT COUNT(*) FROM public.request_audit_logs;` → 0 logo após TRUNCATE.
2. Aguardar 10 min de tráfego real, refazer count. Esperado:
   - Com `REQUEST_AUDIT_LOGS_ENABLED=false` (default): **continua 0**.
   - Com `=true` e tráfego típico: ordem de algumas dezenas/centenas (somente erros + ~1 % de 2xx).
3. `SELECT path, COUNT(*) FROM public.request_audit_logs GROUP BY 1 ORDER BY 2 DESC LIMIT 10;` → não deve aparecer `/health`, `/uploads/*`, `/api/vehicle-images/*`, assets.
4. `pg_total_relation_size('public.request_audit_logs')` → deve ficar estável dia-a-dia (não monotônico).
5. Rodar o cron de prune manualmente uma vez (`--yes`) e confirmar que count cai pra retention window.

## Plano de rollback

| Coisa | Reverso |
| --- | --- |
| **Middleware** | `git revert` do commit. Volta ao comportamento anterior (grava tudo). Não recomendado — re-introduz o bug raiz. |
| **Default OFF** | Setar `REQUEST_AUDIT_LOGS_ENABLED=true` no Render. Não restaura comportamento antigo de "logar tudo" — paths/sampling continuam ativos por design. Esse é o estado seguro. |
| **TRUNCATE** | Irreversível pós-COMMIT. Plano: restore parcial do snapshot CSV (Passo 1 do `.sql`) ou restore do backup automático do Render para uma base secundária. Como a tabela é puramente observacional, perda total é aceitável. |
| **Prune job** | Desligar o cron job no Render. Sem efeito retroativo. |

## Lições / follow-ups

- Auditar outras tabelas observacionais (`metrics_*`, `events_*`) com a mesma régua: existe retenção? Existe amostragem?
- Considerar mover audit logs para um storage mais barato (S3 + Athena, ou só `pino` em stdout coletado pelo Render Logs) — Postgres é caro pra workload append-only de alta cardinalidade.
- Avaliar adicionar um alerta em `pg_total_relation_size` por tabela (Grafana / Render metrics) com threshold de 1 GB.
