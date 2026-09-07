# F0 — Relatório (formato fixo, seção 11 do prompt)

Data: 2026-09-07 · Branch: `f0/governanca` · Base: `feat/catalogo-shell-largo-comprar @ 7ee7599c` (árvore limpa)
Detalhes e provas: `docs/F0_GOVERNANCA.md`.

## 1. Escopo tocado / não tocado

**Tocado (nenhum é código de produto):**

- `docs/F0_GOVERNANCA.md`, `docs/F0_RELATORIO.md` — novos.
- `docs/AUDITORIA_HEAD_SEARCH.md` — trazido da árvore wip (insumo normativo).
- `docker-compose.snapshot.yml` — novo; Postgres 18 local em :5434 para o snapshot de produção.
- `scripts/db/snapshot-prod-to-local.mjs` — novo; dump (somente leitura na origem) + restore local.
- `.gitignore` — `+ .local/` (dumps com dados reais).
- `.claude/launch.json` — `+ f0-backend-snapshot`, `+ f0-frontend-snapshot` (stack local contra o snapshot).

**Não tocado (confirmação de R2):** `frontend/middleware.ts`, `shouldIndexLocalSeo`, canonical, sitemaps, H1, layout, shell 1600, gaveta mobile, header, pagamentos, `src/**`, `frontend/app/**`, `frontend/components/**`, `frontend/lib/**`, migrations, `region_memberships`. `git diff --stat 7ee7599c` limitado aos 7 arquivos acima.

## 2. O que foi feito (tarefas a–e da seção 9, F0)

| Tarefa | Resultado | Prova |
|---|---|---|
| (a) plataforma/commit em produção | Render; portal via `render.yaml`, backend só no dashboard; auto-deploy de `main`; backend em produção = `65bc2e95` = `origin/main` | `render.yaml:1-16`; `README.md:100`; `GET /health` (`src/routes/health.js:90-91`) |
| (b) `curl -sI` produção | 3 URLs → 200, sem `Location`, `q` sobrevive nas três (input, chip, cards) | `F0_GOVERNANCA.md` §2 |
| (c) mesmo no HEAD local | stack subido contra snapshot; 3 URLs → 200, `q` sobrevive; HTML equivalente ao de produção nos marcadores medidos; chamada real `GET /api/ads/search?q=onix&city_slug=braganca-paulista-sp…` capturada | `F0_GOVERNANCA.md` §3 |
| (d) diff `main × HEAD` nos loaders | `frontend/lib/buy/*`, `src/modules/ads`, `src/modules/regions`, middleware: **sem diferença**; só a composição de `/carros-em/[slug]/page.tsx` (5.0B) e o degrade de `local-seo-data.ts` | `git diff --stat refs/heads/main...HEAD -- frontend/lib/buy src/modules/ads …` → vazio |
| (e) base | **PR de merge é vazio**: `7ee7599c` já é ancestral de `origin/main`. Proposta A: base = `origin/main @ 65bc2e95` | `git merge-base --is-ancestor 7ee7599c origin/main` → sim; `git rev-list origin/main..HEAD` → 0 |
| Instrução 2 (árvore wip) | `wip/pre-f0-worktree` (1 commit, 42 arquivos); classificação N/I/D proposta | `F0_GOVERNANCA.md` §7 |
| Instrução 3 (banco local) | snapshot restaurado: 34 ACTIVE / 55 ads / 5.572 cidades / 107.481 memberships / 62 migrations; sentinelas medidas (18,34 · 25,44 · 38,10; cross-UF = 0) | `F0_GOVERNANCA.md` §6 |

## 3. Testes

F0 não adiciona testes automatizados (fase sem código de produto). Executado manualmente:

| Verificação | Resultado | Comando |
|---|---|---|
| Snapshot restaura e confere | OK | `docker compose -f docker-compose.snapshot.yml up -d && node scripts/db/snapshot-prod-to-local.mjs` |
| Sentinelas 8.2 (linha de base, esperadas AUSENTES antes de F1) | 18,34 presente; 25,44 e 38,10 ausentes; cross-UF = 0 | SQL em `F0_GOVERNANCA.md` §6 |
| Invariantes 8.10 em produção e local | `/carros-em/braganca-paulista-sp` (1 ACTIVE) → 200 + `noindex, follow`; canonical limpa com `?q=` | `curl -sI` + grep no HTML |
| 8.10 "cidade 0 ACTIVE → 404" | **NÃO VERIFICADO** nesta fase (nenhuma cidade 0-ACTIVE foi alvo; regra provada por código na auditoria) | — |

## 4. Medições

Não aplicável em F0 (seção 10 começa em F2). Registrado como baseline: backend local `/health` `latency_ms: 33` contra o snapshot; produção `latency_ms: 123`.

## 5. Divergências em relação ao prompt

1. **Base (tarefa e).** O DEFAULT "PR de merge sem squash de HEAD em main" não pode ser cumprido: o merge já existe em `origin/main`. Proposta A/B em `F0_GOVERNANCA.md` §5. **Aguarda decisão.**
2. **`docs/Search_Policy_Engine_v2_1_Consolidado.md`** não está no repositório (verificado ao início, no meio e ao fim da fase). Releitura pendente; o prompt prevalece.
3. `.claude/launch.json` foi alterado (adição de 2 configurações). Não está em R2, mas registro por ser configuração compartilhada do repositório.
4. `gh` sem autenticação válida → PR **não** foi criado; branch pushada e link de compare fornecido.

Nenhuma divergência de código de produto.

## 6. DEFAULTS aplicados e dúvidas

- Nome da branch de fase: `f0/governanca` (o prompt não fixa o padrão; proponho `f<n>/<tema>`).
- Snapshot em serviço Docker **separado** (`docker-compose.snapshot.yml`, PG 18, :5434) em vez de reaproveitar `docker-compose.test.yml` (PG 15, :5433) — a major de produção é 18 e o banco de teste é truncado pelas suítes.
- Dump em `.local/snapshots/` (gitignored), não no scratchpad, para o script ser reproduzível por qualquer pessoa.

Dúvidas para o usuário (decidir antes de "APROVADO F0" ou junto com ele):

1. Base A (`origin/main @ 65bc2e95`) ou B (`7ee7599c`)?
2. Quais itens da árvore wip entram, e quando (`ci.yml` muda o gate de todos os PRs)?
3. Posso fazer o fast-forward de `main` local, ou você faz?

## 7. Como desligar / reverter

- Nada a desligar: nenhuma flag, nenhum código de produto.
- Reverter = fechar o PR de `f0/governanca` sem mergear. Nenhuma migration foi criada.
- Banco local: `docker compose -f docker-compose.snapshot.yml down -v` remove container e volume; apagar `.local/snapshots/` remove os dumps (dados pessoais reais).
- Servidores locais (`f0-backend-snapshot`, `f0-frontend-snapshot`) ficaram no ar ao fim da fase para inspeção; parar pelo painel de preview.

---

### Corpo sugerido para o PR de `f0/governanca` → `main`

```
F0: governança do Search Policy Engine v2.1

- docs/F0_GOVERNANCA.md — plataforma/pipeline, commit em produção (65bc2e95 = origin/main),
  curl -sI produção × HEAD local, diff main×HEAD nos loaders, base proposta, snapshot local
- docs/F0_RELATORIO.md — relatório no formato da seção 11
- docs/AUDITORIA_HEAD_SEARCH.md — auditoria somente-leitura de 2026-09-07 (insumo)
- docker-compose.snapshot.yml + scripts/db/snapshot-prod-to-local.mjs — Postgres 18 local
  com dump somente-leitura de produção (.local/ gitignored)
- .claude/launch.json — configs f0-backend-snapshot / f0-frontend-snapshot

Sem código de produto. Sem migrations. Sem flags.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
