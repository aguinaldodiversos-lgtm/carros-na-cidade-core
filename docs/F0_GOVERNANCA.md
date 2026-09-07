# F0 — Governança (Search Policy Engine v2.1)

**Data:** 2026-09-07 · **Branch de fase:** `f0/governanca` (nascida limpa de `feat/catalogo-shell-largo-comprar @ 7ee7599c`)
**Nenhum código de produto foi alterado.** Esta fase produz documentação, tooling de banco local e configuração de execução.

Nível de prova: cada linha cita `arquivo:linha`, um comando executado, ou está marcada **NÃO VERIFICADO**.

---

## 1. Plataforma e pipeline de deploy (tarefa a)

| Item | Valor | Prova |
|---|---|---|
| Hospedagem | Render, 2 serviços web | `render.yaml:1-6` (portal); backend em `https://carros-na-cidade-core.onrender.com` (`render.yaml:14-16`) |
| Portal (Next) | serviço `carros-na-cidade-portal`, `rootDir: frontend`, `npm run build` + `npm run start` | `render.yaml:2-8` |
| Backend (Express) | serviço **não versionado** em `render.yaml` — vive só no dashboard do Render | grep `type: web` em `render.yaml` → 1 ocorrência (portal) |
| Branch de deploy | `main`, auto-deploy | `README.md:100` ("deploy automático do frontend a partir de `main`"). Backend: **NÃO VERIFICADO** no repositório (dashboard), mas o commit reportado em produção coincide com `origin/main` (abaixo) |
| CI | GitHub Actions: `ci.yml` (lint/test/build/integration/E2E) e `public-contract-smoke.yml` (2×/dia contra `https://www.carrosnacidade.com`) | `.github/workflows/` |
| Dockerfile / vercel / railway / fly | não existem | `ls` na raiz |
| Tags | nenhuma tag de release (`local-4-4-e2e-backup` é backup local) | `git tag` |
| Endpoint de versão | backend `GET /health` expõe `version` (`npm_package_version`) e `commit` (`RENDER_GIT_COMMIT`) | `src/routes/health.js:90-91` |
| Portal | não expõe commit; identificado por marcadores de HTML (§2) | — |

### Commit em produção

```
GET https://carros-na-cidade-core.onrender.com/health
{"ok":true,"status":"healthy","env":"production","service":"carros-na-cidade-core",
 "version":"2.1.0","commit":"65bc2e95a56553538a903f7818333f388514d8a1",
 "uptime_s":106799,"checks":{"db":"up","redis":"disabled","antifraud_schema":"ok"}}
```

**Backend em produção = `65bc2e95` = `origin/main`.** Uptime de 106.799 s (~29,7 h) ⇒ deploy em 2026-09-06 ~11:50 BRT, minutos depois do commit (`git show 65bc2e95` → 2026-09-06 11:48 -0300).

### Topologia real dos branches (corrige a ressalva da auditoria)

| Ref | SHA | Observação |
|---|---|---|
| `main` (local) | `190df7a5` | **22 commits atrás** de `origin/main`; fast-forward possível (`git merge-base --is-ancestor main origin/main` → sim) |
| `origin/main` | `65bc2e95` | = `7ee7599c` + 1 commit (`Update FinancingSimulator.tsx`, 1 linha de copy, feito pela UI do GitHub) |
| `feat/catalogo-shell-largo-comprar` = HEAD auditado | `7ee7599c` | **ancestral de `origin/main`** (`git merge-base --is-ancestor 7ee7599c origin/main` → sim); `git rev-list origin/main..HEAD` → **0** |

A auditoria (`docs/AUDITORIA_HEAD_SEARCH.md`, "Ressalva metodológica") comparou o HEAD com o `main` **local** desatualizado e concluiu que produção não rodava os 21 commits. **A conclusão está errada por causa do ref local, não do código:** os 21 commits já estão em `origin/main` e em produção. A Fase 5.0B (`1aea9584`) **está** em produção.

Diferença `7ee7599c → origin/main`:

```
frontend/components/financing/FinancingSimulator.tsx | 2 +-   (texto do aviso "Cálculo estimado…")
```

---

## 2. `curl -sI` em produção (tarefa b)

UA de navegador (o backend bloqueia `curl/*` por User-Agent — ver `src/shared/middlewares/bot-blocker.middleware.js`). Executado 2026-09-07 ~17:30 BRT.

| URL | Status | `Location` | `x-middleware-*` | `q` sobrevive? |
|---|---|---|---|---|
| `https://www.carrosnacidade.com/comprar?q=onix` | **200** | — | — | **Sim**: `value="onix"` no input, chip `Busca: onix`, 6 links `/veiculo/` (os 6 Onix de Atibaia), "34 anúncios" no diretório |
| `https://www.carrosnacidade.com/carros-usados/regiao/braganca-paulista-sp?q=onix` | **200** | — | `x-middleware-regional: passed-valid` | **Sim**: `value="onix"`, `Busca: onix`, 6 links `/veiculo/`, cards "Atibaia (SP)" ×6 |
| `https://www.carrosnacidade.com/carros-em/braganca-paulista-sp?q=onix` | **200** | — | — | **Sim**: `value="onix"`, `Busca: onix`, 0 links `/veiculo/`, estado vazio ("Nenhum") — coerente: não há Onix em Bragança |
| `https://carrosnacidade.com/comprar?q=onix` (apex) | 301 | `https://www.carrosnacidade.com/comprar?q=onix` | — | Sim (preservado no redirect) |

Todas as três: `<meta name="robots" content="noindex, follow">`; canonical de `/comprar?q=` → `/comprar`; canonical da regional e de `/carros-em?q=` → `/carros-em/braganca-paulista-sp`.

**Conclusão:** F5 ("região ignora `q`") e F6 ("`/comprar?q=onix` perde o parâmetro") **não reproduzem em produção**. Ficam refutadas, como a auditoria já previa para o HEAD (§7.8).

### Marcadores de versão do portal em produção (`/carros-em/braganca-paulista-sp`)

| Marcador | Ocorrências | Significado |
|---|---|---|
| `Próximos` / `NearbyRadius` | 0 | bloco "Próximos até X km" **não** é montado → pós-5.0B |
| `Perguntas frequentes` | 0 | `FaqBlock` removido → pós-5.0B |
| `max-w-[1600px]` | 1 | shell largo (`bb601c0b`) presente |
| `e região` | 1 | subtítulo fixo "Ofertas em Bragança Paulista e região" (auditoria §7.3, "Mensagens de expansão") |
| links `/veiculo/` | 1 | 1 card (o único ACTIVE próprio) — **F1 da auditoria explicado pelo código atual, não por regressão** |

---

## 3. Stack local do HEAD contra snapshot de produção (tarefa c)

Subido com `.claude/launch.json` → `f0-backend-snapshot` (Express :4000, `RUN_MIGRATIONS=false`, `RUN_WORKERS=false`, `DISABLE_REDIS=true`, `DATABASE_URL` = snapshot :5434) e `f0-frontend-snapshot` (Next dev :3000, `BACKEND_API_URL=http://127.0.0.1:4000`, `REGIONAL_PAGE_ENABLED=true`, `INTERNAL_API_TOKEN` local para o SSR não cair no rate limit por minuto do backend — sem ele o backend respondeu 429 a metade das chamadas do BFF).

| URL (local, HEAD `7ee7599c`) | Status | `x-middleware-*` | `q` sobrevive? | Igual a produção? |
|---|---|---|---|---|
| `/comprar?q=onix` | 200 | — | Sim (`value="onix"`, `Busca: onix`, 6 `/veiculo/`, "34 anúncios") | **Sim** |
| `/carros-usados/regiao/braganca-paulista-sp?q=onix` | 200 | `passed-valid` | Sim (6 `/veiculo/`) | **Sim** (com a flag; sem `REGIONAL_PAGE_ENABLED` → 404 `blocked-flag-off`, diferença de **env**, não de código) |
| `/carros-em/braganca-paulista-sp?q=onix` | 200 | — | Sim (0 cards, "Nenhum") | **Sim** |
| `/carros-em/braganca-paulista-sp` | 200 | — | — | **Sim** (1 card, `e região` ×1, sem `Próximos`/FAQ) |

Chamada real capturada no log do backend local durante o SSR da página de cidade:

```
GET /api/ads/search?q=onix&city_slug=braganca-paulista-sp&sort=relevance&page=1&limit=50
```

Isto fecha H4/F5 da auditoria: `q` chega ao backend intacto junto com o território da rota.

Robots e canonical locais idênticos aos de produção (trocando o host).

---

## 4. Diff de comportamento `main × HEAD` nos loaders (tarefa d)

Comparação `refs/heads/main...HEAD` (o `main` local, que é o que a auditoria usou):

| Área | Diferença | Comportamento |
|---|---|---|
| `frontend/lib/buy/*` (city/region/national/state-catalog-loader) | **nenhuma** (`git diff --stat` vazio) | loaders idênticos |
| `src/modules/ads`, `src/modules/regions`, `src/routes`, `frontend/middleware.ts`, `frontend/lib/middleware` | **nenhuma** | backend de busca e gates idênticos |
| `frontend/app/carros-em/[slug]/page.tsx` | −163 linhas líquidas | deixa de montar `NearbyRadiusSection`, `CityAuthoritySection`, `CompactCitySeoBlock`, `FaqBlock`; deixa de ler `?raio=`; remove `areaServed` e `FAQPage` do JSON-LD; `loadSeoModel` passa a `onServiceFailure: "degrade"` |
| `frontend/lib/seo/local-seo-data.ts` | +101 | falha do serviço de conteúdo → modelo degradado `noindex` em vez de 404 (só em `/carros-em`); `notFound()` legítimo é re-lançado |
| `frontend/app/comprar/page.tsx` | +10/−2 | só largura do diretório (`max-w-[1600px]`) |
| `carros-usados/regiao/[slug]/page.config.test.ts` | teste | sem mudança de runtime |

E `7ee7599c → origin/main`: 1 linha de copy no `FinancingSimulator.tsx`.

**Nenhuma regressão de busca entre `main` local, HEAD e `origin/main`**: mesmas queries, mesmo tratamento de `q`, mesmos gates. As diferenças são de composição da página de cidade (5.0B) e já estão em produção.

---

## 5. Base proposta para F1–F5 (tarefa e)

O DEFAULT do prompt ("branch atual mergeada em `main` via PR sem squash") **não se aplica**: o merge já aconteceu upstream — `origin/main` contém os 21 commits mais um. Um "PR de merge" de `7ee7599c` em `main` seria vazio.

| Opção | Consequência |
|---|---|
| **A (recomendada)** — base = `origin/main @ 65bc2e95` | Idêntica ao que roda em produção; inclui a linha de copy. F1–F5 nascem de `origin/main`. Nenhum PR de base é necessário |
| B — base = `7ee7599c` (o que foi definido) | Difere de produção por 1 linha de copy; toda branch de fase geraria conflito trivial ao abrir PR contra `main` |

Recomendação: **A**. O `main` local deve ser atualizado por fast-forward (`git checkout main && git pull --ff-only`) — não fiz isso por R9 ("não tocar em main diretamente").

`f0/governanca` nasceu de `7ee7599c` conforme instruído; ao ser aberto contra `main`, o PR terá exatamente os arquivos desta fase (o commit de copy já está na base remota).

---

## 6. Banco local com snapshot de produção (instrução 3 do usuário)

| Item | Valor |
|---|---|
| Produção | PostgreSQL **18.3** (Render, 47 MB); extensões `plpgsql`, `pg_trgm`, `unaccent` |
| Serviço de teste existente | `docker-compose.test.yml` → postgres:**15** em :5433 (`carros_na_cidade_test`) — major diferente; pg_dump 18 não restaura limpo em 15 |
| **Novo** | `docker-compose.snapshot.yml` → postgres:**18** em :5434, `carros_na_cidade_snapshot` |
| **Novo** | `scripts/db/snapshot-prod-to-local.mjs` — `pg_dump -Fc` dentro de `postgres:18` (somente leitura na origem) + `pg_restore --clean --if-exists` no container local; dump em `.local/snapshots/` (gitignored — contém dados pessoais reais) |
| Origem | `DATABASE_URL1` do `.env`, só leitura. **Nunca** alvo de escrita em nenhuma fase |
| Como apontar o código | `DATABASE_URL=postgresql://postgres:postgres@localhost:5434/carros_na_cidade_snapshot` |

Conferência pós-restore (2026-09-07 17:37 BRT):

| Tabela | Linhas |
|---|---|
| `ads` (status = active) | 34 |
| `ads` (total) | 55 |
| `cities` | 5.572 |
| `region_memberships` | 107.481 (layer 0: 5.572 · 1: 29.880 · 2: 66.377 · 3: 5.652) |
| `schema_migrations` | 62 (última: `062_ads_admin_moderation_block.sql`, 2026-08-26 = última do repositório em `src/database/migrations/`) |
| `users` | 123 |

Sentinelas geográficas (haversine R = 6371 sobre `cities.latitude/longitude` do snapshot):

| Par | km | `region_memberships.distance_km` |
|---|---|---|
| atibaia-sp ↔ braganca-paulista-sp | 18,34 | 18.34 |
| braganca-paulista-sp ↔ extrema-mg | 25,44 | **ausente** (cross-UF) |
| atibaia-sp ↔ extrema-mg | 38,10 | **ausente** (cross-UF) |
| braganca-paulista-sp ↔ campinas-sp | 53,92 | ausente (F1 investiga: layer 2 deveria cobrir 30–60 km) |
| `COUNT(*) WHERE b.state <> m.state` | **0** | — |

Estas são as linhas de base que a F1 tem de superar (seção 3.1 do prompt: 25,4 / 38,1 / 18,3, cross-UF > 0).

Outros fatos confirmados no snapshot, para a F1: `ads.commercial_model` **não existe**; `transmission`/`gearbox`/`cambio` existem (três); `cities` sem lat/lng = 1; `platform_settings.search_policy` **não existe** (`regional.radius_km` = 80); `subscription_plans`: Pro 3.00, Start 2.00, demais 1.00 (`cpf-premium-highlight` e `cnpj-evento-premium` já estão em 1.00 — D7 do prompt será no-op; registrar).

---

## 7. Árvore de trabalho pré-F0 (instrução 2 do usuário)

Preservada em `wip/pre-f0-worktree` (1 commit: `wip: árvore pré-F0 (não revisado)`, 42 arquivos, +8.355/−181). Classificação **proposta** — decisão é do usuário:

Legenda: **N** = necessário para os testes das fases · **I** = independente · **D** = descartável.

| Arquivo | Estado | Classe | Motivo |
|---|---|---|---|
| `docs/AUDITORIA_HEAD_SEARCH.md` | novo | **N** | insumo normativo; já incluído em `f0/governanca` |
| `tests/integration/ads-ranking-base-city-boost.integration.test.js` | mod. | **N (F2)** | fixture corrigida (`city_id`/`slug` NOT NULL, 6º parâmetro faltante). Sem ela o teste que cobre o `baseCityBoost` — justamente o que F2 muda sob flag — morre no setup |
| `frontend/test/guards/production-target.{ts,test.ts}` | novo | **N (F3/F4)** | guard que impede a suíte E2E de rodar contra produção (`frontend/.env.local` aponta para o backend real). Proteção direta da instrução 3 |
| `frontend/test/guards/seed-state.{ts,test.ts}` + `frontend/e2e/.gitignore` | novo | **N (F3)** | estado do seed E2E; o `.gitignore` é o que esconde `frontend/e2e/.seed-state.json` (hoje órfão na árvore limpa) |
| `scripts/run-integration-tests.mjs` + scripts `test:integration*` em `package.json` | novo/mod. | **I** (F1 deve revisitar) | runner da suíte completa com QUARENTENA nomeando **BUG-REG-01** (self-row de `region_memberships` não criada para cidade nova) — F1 toca exatamente isso |
| `tests/integration/ads-opportunity`, `purchase-intent-offers-concurrency`, `sale-request-offers-concurrency` | mod. | **I** | correções de fixture BUG-INT-01; fora do escopo de busca |
| `.github/workflows/ci.yml` | mod. | **I** | integração completa + MinIO + API no E2E. Afeta o gate de **todo** PR de fase se adotado antes; recomendo decidir antes de F1 |
| `docker-compose.test.yml`, `.env.example`, `scripts/e2e-storage-prepare.mjs`, scripts `storage:*` | mod./novo | **I** | MinIO como R2 de teste (BUG-ENV-01) |
| `scripts/e2e-seed.mjs`, `frontend/e2e/{helpers,full-flow.spec,main-flow.spec,publish-wizard}.ts`, `frontend/playwright.config.ts`, `docs/testing/e2e.md` | mod. | **I** (útil em F3) | infra E2E; 8.9 cria specs novos e pode reaproveitar `helpers.ts` |
| `frontend/e2e/{ops-viewport-overflow,seo-sitemap-urls,session-persistence-gates}.spec.ts` | novo | **I** (candidato a 8.10) | `seo-sitemap-urls` cobre sitemap — pode virar o snapshot exigido em 8.10 |
| `frontend/app/simulador-financiamento/route.test.ts`, `frontend/app/tabela-fipe/route.test.ts`, `frontend/components/financing/FinancingSimulator.test.tsx`, `frontend/lib/admin/server-admin-session.test.ts`, `frontend/lib/favorites/local-favorites.test.ts` | novo | **I** | testes unitários de outras áreas (`FinancingSimulator.test.tsx` não asserta o texto alterado em `65bc2e95` — verificado por grep) |
| `tests/auth/*.test.js`, `tests/integration/payments-boost-webhook-idempotency`, `tests/integration/vehicle-image-storage` | novo | **I** | outras áreas |
| `reports/fase-4-0-…`, `reports/fase-h1-5-…`, `reports/fase-h1-6-…`, `reports/homologacao-…` | novo | **I** | documentação das fases H1.5/H1.6 |
| `frontend/public/images/{lojista-detalhe-veiculo-referencia,lojista-oportunidades-veiculos-referencia,vender-para-loja}.png` | novo | **I** (revisar destino) | referências visuais; em `public/` seriam servidas publicamente — talvez pertençam a `reports/` |
| `frontend/e2e/.seed-state.json` (não está no commit wip; gerado) | órfão | **D** | artefato gerado pelo seed; some quando o `.gitignore` de `frontend/e2e/` for adotado |

Achado colateral: existe um arquivo **rastreado** chamado `main` (0 bytes, 2026-04-05) na raiz. Ele faz `git` reclamar de ambiguidade em comandos como `git log main` (precisa `refs/heads/main` ou `--`). Não removi (R2/R10); sugiro remoção em F5 ou num commit avulso.

---

## 8. PR preparado (não mergeado)

- Branch: `f0/governanca` (pushada em `origin`).
- Abrir contra `main`: <https://github.com/aguinaldodiversos-lgtm/carros-na-cidade-core/compare/main...f0/governanca?expand=1>
- `gh` nesta máquina está com token inválido (`gh auth status` → HTTP 401); o PR precisa ser aberto pela UI ou após `gh auth login`. Corpo sugerido em `docs/F0_RELATORIO.md`.
- Branch de preservação: `wip/pre-f0-worktree` (pushada; **não** abrir PR dela).

---

## 9. Pendências abertas ao fim de F0

1. `docs/Search_Policy_Engine_v2_1_Consolidado.md` **ainda não existe** no repositório (verificado 3× durante a fase). Releitura pendente.
2. `main` local 22 commits atrás de `origin/main` — fast-forward a fazer pelo usuário.
3. Decisão sobre a árvore wip (§7), em especial `ci.yml` (muda o gate de todos os PRs) e o teste de ranking (necessário em F2).
4. Serviço de backend do Render fora do `render.yaml` — permanece como ponto cego de revisão.

---

## 10. Fechamento de F0 (decisões do usuário, 2026-09-07)

1. **Base de F1–F5 = `origin/main @ 65bc2e95`** (opção A). A auditoria `docs/AUDITORIA_HEAD_SEARCH.md` feita em `7ee7599c` **permanece válida** para essa base: `origin/main` = `7ee7599c` + 1 commit que altera apenas uma string de copy em `frontend/components/financing/FinancingSimulator.tsx` (`git diff --stat 7ee7599c origin/main` → 1 arquivo, 1 linha). Nenhum arquivo de busca, território, ranking ou SEO difere.
2. **F5 e F6 refutadas em produção com evidência de log.** Produção (§2): as três URLs respondem 200 com `q` presente no input, no chip e nos cards. HEAD local (§3): o backend registrou `GET /api/ads/search?q=onix&city_slug=braganca-paulista-sp&sort=relevance&page=1&limit=50` durante o SSR da página de cidade, e a regional/`/comprar` devolveram os mesmos 6 cards Onix de produção. As hipóteses H4/F5/F6 ficam encerradas.
3. `main` local foi avançado por fast-forward para `origin/main` (`git merge --ff-only`), a pedido.
4. Arquivo rastreado `main` (0 bytes, criado em `1a93a81a`, 2026-03-03, "chore: apply stashed changes"): grep em `package.json`, `.github/workflows`, `scripts/`, `docs/`, `render.yaml` não encontrou nenhuma referência ao arquivo (as ocorrências de `main` são funções `main()`, `"main": "src/index.js"` e o nome do branch). Removido em commit próprio nesta branch.
5. `ci.yml` da árvore wip vira PR separado, fora das fases; F1–F5 usam o `ci.yml` de `origin/main`.
6. Da árvore wip: a fixture corrigida de `ads-ranking-base-city-boost` entra em F2 (cherry-pick único, citado no relatório); `frontend/test/guards/production-target` entra em F3. O restante fica em `wip/pre-f0-worktree`.
