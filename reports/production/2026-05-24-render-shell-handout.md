# 2026-05-24 — Render Shell: backup + SQL + smoke

Use este passo-a-passo no **Render Shell** do **service backend** (`carros-na-cidade-core`)
após confirmar deploy verde do commit `b83fe67e` nos dois services.

DATABASE_URL nunca sai do Render. Não me passe a string.

---

## Passo 1 — Confirmar que está no service certo + commit certo

```bash
# Branch + commit servido por este service:
cd $RENDER_SRC_ROOT 2>/dev/null || cd /opt/render/project/src
git log -1 --oneline
git rev-parse HEAD
```

Esperado: `b83fe67e fix(producao-critica-2026-05-24)...`

Se NÃO bater, **PARE** — o deploy não pegou esse service.

---

## Passo 2 — Backup do banco (Render web dashboard PREFERIDO)

**Caminho A (recomendado, gerenciado pelo Render):**

1. Dashboard Render → seu PostgreSQL service
2. Aba **Backups** → botão "Create manual backup"
3. Aguardar status "Available"
4. Confirme o timestamp ≈ agora e me reporta o backup ID.

**Caminho B (pg_dump direto no Shell — fallback se Backups indisponível):**

```bash
# No Shell do BACKEND service (que tem DATABASE_URL exposta):
mkdir -p /tmp/cnc-backups
pg_dump "$DATABASE_URL" \
  --no-owner --no-privileges \
  --format=custom \
  --file=/tmp/cnc-backups/cnc-prod-pre-fix-2026-05-24.dump \
  --verbose 2>&1 | tail -5

ls -lh /tmp/cnc-backups/
```

Se Caminho B: faça download imediato (`/tmp` é volátil no Render). Você pode
movê-lo para R2/S3 ou usar `cat` + `base64` se for muito pequeno (improvável).

NÃO PROSSEGUIR para o Passo 3 sem confirmação de backup feito.

---

## Passo 3 — Executar o SQL idempotente

O script tem 5 blocos transacionais com SELECTs antes/depois.

```bash
# Ainda no Shell do BACKEND:
cd $RENDER_SRC_ROOT 2>/dev/null || cd /opt/render/project/src

# Verifica que o script está presente (sanity):
test -f scripts/sql/2026-05-24-fix-producao-critico.sql && echo "ok" || echo "FALTANDO"

# Roda capturando TODO o output:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/sql/2026-05-24-fix-producao-critico.sql \
  > /tmp/sql-output-2026-05-24.log 2>&1
echo "exit_code=$?"

# Mostra o que aconteceu:
head -200 /tmp/sql-output-2026-05-24.log
echo "..."
tail -100 /tmp/sql-output-2026-05-24.log
```

**Se exit_code ≠ 0:** PARE. Cole o conteúdo de `/tmp/sql-output-2026-05-24.log`
para eu analisar. Não tente corrigir sozinho.

Cole o output COMPLETO de volta no chat — eu salvo em
`reports/production/2026-05-24-fix-producao-sql-output.txt`.

---

## Passo 4 — Auditoria pós-SQL

```bash
cd $RENDER_SRC_ROOT 2>/dev/null || cd /opt/render/project/src
node scripts/audit/audit-production-ads-quality.mjs --limit=5000 2>&1 \
  | tee /tmp/audit-2026-05-24.log
```

Cole o resumo final (últimas ~30 linhas) aqui.

---

## Passo 5 — Smoke público (qualquer máquina, eu rodo daqui)

Após o SQL aplicado e o front confirmadamente no commit b83fe67e:

```bash
# Eu vou rodar daqui — só me avisa que está pronto.
BASE_URL=https://www.carrosnacidade.com bash scripts/smoke/public-territorial-smoke.sh
BASE_URL=https://carrosnacidade.com bash scripts/smoke/public-territorial-smoke.sh
```

---

## Resumo do que você me reporta de volta

1. ✅/❌ Backup feito (ID ou path)
2. SQL exit code
3. Output completo do SQL (cole no chat ou anexe)
4. Output do audit (últimas linhas)
5. ✅/❌ Confirmação de que ambos services no Render estão em b83fe67e

Eu coloco tudo em `reports/production/2026-05-24-validacao-final.md` e dou o veredito de aprovação/reprovação.
