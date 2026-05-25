# Smoke público — agendamento (P2-E 2026-05-25)

Este runbook documenta **como** rodar o `public-contract-smoke.mjs` em
intervalos regulares contra produção. Nada aqui é ativado por padrão —
é receita pronta para o dia em que a equipe quiser orquestrar o
monitoramento contínuo de contrato público.

> **Status atual (2026-05-25):** smoke não roda em cron. É executado
> manualmente após cada deploy e nos PRs sensíveis ao contrato público
> (P0/P1/P2). A pergunta "ativar cron pago?" volta no P3.

## O script

`scripts/smoke/public-contract-smoke.mjs` (Node 20+, zero deps).

- Cobre **15 rotas críticas**.
- Bloqueia se o HTML público contiver strings proibidas (Teste, Test,
  DeployModel, Seed, Worker, Alerta, Fake, Dummy, "SÆo Paulo",
  "backend irá incorporar", "features[]", "has_photo", "R$ 0" fake,
  "plano Pro/Start" como vitrine).
- Bloqueia se o detalhe de qualquer anúncio listado tiver fallback fake
  (T-Cross id 999001 / slug volkswagen-t-cross-2022-2023).
- Bloqueia se um anúncio listado for inválido (HTTP != 200; quando o
  header `x-middleware-ad` está presente, deve ser `passed-valid`).

### Comando

```bash
# Roda em produção (default https://www.carrosnacidade.com)
node scripts/smoke/public-contract-smoke.mjs

# Base custom (staging)
node scripts/smoke/public-contract-smoke.mjs --base=https://staging.carrosnacidade.com

# Saída JSON (para parser de CI / Slack bot)
node scripts/smoke/public-contract-smoke.mjs --json

# Detalhado
node scripts/smoke/public-contract-smoke.mjs --verbose
```

Exit codes:

- `0` — todas as checks críticas passaram.
- `1` — pelo menos uma falha (deploy quebrou contrato).
- `2` — erro de execução (rede, DNS, timeout).

## Opção A — Render Scheduled Job

**Vantagem:** mesma plataforma que serve a aplicação; sem custo extra
de minutos de runner.

**Custo aproximado:** plano Starter inclui Scheduled Jobs. A execução
do smoke leva tipicamente <30s (15 GETs + parsing), o que é desprezível.

`render.yaml` (snippet — **não comitar ativado sem aprovação**):

```yaml
- type: cron
  name: cnc-public-contract-smoke
  runtime: node
  schedule: "*/30 * * * *"  # a cada 30 min
  buildCommand: "echo no-op"
  startCommand: "node scripts/smoke/public-contract-smoke.mjs --json"
  envVars: []
  region: oregon
```

Se quiser falar no Slack quando falhar, embrulhar com pipe:

```bash
node scripts/smoke/public-contract-smoke.mjs --json \
  | tee /tmp/smoke.json \
  | jq -e '.failed == 0' \
  || curl -X POST -H 'Content-Type: application/json' \
     --data @/tmp/smoke.json \
     "$SLACK_WEBHOOK_URL"
```

## Opção B — GitHub Actions

**Vantagem:** versionado no repo; histórico de execuções; fácil de
ativar/desativar com PR.

**Custo:** runner Linux a US$0.008/min × ~1 min × frequência. A 30 min
de intervalo são ~1.440 execuções/mês → ~US$11/mês. **Não recomendado
sem aprovação.**

`.github/workflows/public-contract-smoke.yml` (snippet —
**não comitar ativado sem aprovação**):

```yaml
name: Public Contract Smoke
on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch:

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - name: Run smoke
        run: node scripts/smoke/public-contract-smoke.mjs --json
        env: { BASE: "https://www.carrosnacidade.com" }
      - name: Notify Slack on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: '{ "text": "🚨 public-contract-smoke FAIL — ${{ github.run_url }}" }'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## Opção C — cron externo (vps, máquina pessoal)

**Custo:** zero, mas sem alta disponibilidade.

```cron
# Roda a cada 30 min, log em ~/cnc-smoke.log
*/30 * * * * cd /caminho/carros-na-cidade-core && /usr/bin/node scripts/smoke/public-contract-smoke.mjs >> ~/cnc-smoke.log 2>&1
```

Em Windows (Task Scheduler), criar tarefa básica que chama
`node.exe scripts\smoke\public-contract-smoke.mjs` no diretório do repo.

## Quando ativar

Critério proposto (sujeito à aprovação):

1. **Necessário:** mais que 1 incidente público em 30 dias com causa
   raiz em "contrato público quebrou e ninguém viu".
2. **Necessário:** equipe maior que 1 dev (hoje o autor manualmente
   roda após cada deploy — escala enquanto for solo).
3. **Necessário:** orçamento aprovado para US$11/mês (GitHub Actions)
   ou plano Render ≥ Standard.

Enquanto nenhum dos três bater, o smoke continua manual.

## Como ativar (resumo)

1. Escolher opção (A/B/C) — A é a mais barata se já temos plano Render
   compatível.
2. Adicionar o snippet no arquivo correspondente (`render.yaml` ou
   `.github/workflows/`).
3. Configurar `SLACK_WEBHOOK_URL` no painel de secrets da plataforma.
4. Fazer deploy e checar que a primeira execução roda no horário
   esperado.
5. Abrir um issue tracking "first failure of smoke cron" e anexar a
   investigação que vier do alerta.

## Como desativar

- Render: deletar o bloco `type: cron`, ou setar `schedule: "0 0 31 2 *"`
  (31 de fevereiro — nunca executa).
- GitHub Actions: apagar/renomear o `.yml`, ou comentar o `on.schedule`.
- cron local: `crontab -e` e remover a linha.

## Histórico

- 2026-05-25 — Criado por P2-E (Contract Lock & Cleanup). Smoke ainda
  manual; runbook pronto para a primeira escalada que justificar o cron.
