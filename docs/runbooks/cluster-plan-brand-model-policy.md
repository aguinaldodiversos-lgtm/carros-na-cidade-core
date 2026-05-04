# Política de Brand/Model no Bootstrap de Cluster Plans

> **Status:** decisão arquitetural. Não implementa código.
> **Pré-requisitos:**
> [bootstrap-staging-dry-run-results.md](./bootstrap-staging-dry-run-results.md) (achado do bloqueador 2),
> [fase1-production-validation.md](./fase1-production-validation.md) (Fase 1 confirmada em prod),
> [cluster-planner-bootstrap.md](./cluster-planner-bootstrap.md) (transformer atual).

---

## 1. Contexto

O script [scripts/seo/bootstrap-cluster-plans.mjs](../../scripts/seo/bootstrap-cluster-plans.mjs) foi criado (Opção 2 do runbook [cluster-planner-bootstrap.md](./cluster-planner-bootstrap.md)) para popular `seo_cluster_plans` em produção com paths já alinhados às canônicas intermediárias da Fase 1 — corrigindo o problema dos sitemaps territoriais vazios documentado em [sitemap-empty-investigation.md](./sitemap-empty-investigation.md).

O transformer puro [src/modules/seo/planner/cluster-plan-canonical-transform.js](../../src/modules/seo/planner/cluster-plan-canonical-transform.js) faz o mapping `cluster_type → path`. Para `city_home` e `city_below_fipe`, ele já reescreve para as canônicas Fase 1. Para `city_opportunities`, retorna `null` (skip por design — canonicaliza pra mesma URL que `city_below_fipe` transforma para). **Para `city_brand` e `city_brand_model`, o transformer atualmente PRESERVA o path original** (`/cidade/[slug]/marca/[brand]` etc) porque a Fase 1 não tocou nessas rotas.

Este runbook decide se essa preservação é segura para o bootstrap inicial.

---

## 2. Estado atual em produção

### 2.1 Cluster types já tratados pela Fase 1

| `cluster_type` | Path do builder | Canonical/robots em prod (validado em [fase1-production-validation.md §2](./fase1-production-validation.md)) | Decisão do transformer |
|---|---|---|---|
| `city_home` | `/cidade/[slug]` | canonical = `/carros-em/[slug]`, `noindex, follow` | Reescreve → `/carros-em/[slug]` (canônica intermediária) |
| `city_below_fipe` | `/cidade/[slug]/abaixo-da-fipe` | canonical = `/carros-baratos-em/[slug]`, `noindex, follow` | Reescreve → `/carros-baratos-em/[slug]` |
| `city_opportunities` | `/cidade/[slug]/oportunidades` | _(esperado)_ canonical = `/carros-baratos-em/[slug]`, `noindex, follow` | **Skip** (`null`) — duplicidade semântica com `below_fipe` |

### 2.2 Cluster types NÃO tratados pela Fase 1 — auditoria fresca

Auditoria via `curl -sSL` em `https://www.carrosnacidade.com` (capturada originalmente em [bootstrap-staging-dry-run-results.md §6](./bootstrap-staging-dry-run-results.md), reaproveitada aqui):

| URL testada | HTTP | `<meta name="robots">` | `<link rel="canonical">` | Diagnóstico |
|---|---|---|---|---|
| `/cidade/atibaia-sp/marca/honda` | 200 | **`noindex, follow`** | `…/cidade/atibaia-sp/marca/honda` (self) | Página atual é noindex. |
| `/cidade/atibaia-sp/marca/honda/modelo/civic` | 200 | **`noindex, follow`** | self | Mesma situação. |
| `/cidade/atibaia-sp/marca/fiat` | 200 | **`noindex, follow`** | self | Mesma situação. |
| `/cidade/atibaia-sp/marca/vw%20-%20volkswagen` | 200 | **`noindex, follow`** | self | Mesma situação + path com espaço já encoded (bug existente, fora do escopo). |

**Conclusão:** todas as 4 amostras de `/cidade/[slug]/marca/...` em prod retornam **`noindex, follow`** com canonical self. Não há razão para suspeitar que outras cidades/marcas/modelos se comportem diferente — a configuração vem do mesmo template (`app/cidade/[slug]/marca/[brand]/page.tsx` etc).

---

## 3. Risco SEO

Persistir paths `noindex` no sitemap cria **sinal contraditório** para crawlers:

- **Sitemap diz:** "esta URL existe e merece ser indexada — me visite e indexe".
- **Meta robots da página diz:** "não me indexe".

Consequências documentadas pela própria Google ([Search Central — Combine crawling and indexing rules](https://developers.google.com/search/docs/crawling-indexing/block-indexing)):

1. **Desperdício de crawl budget.** Googlebot baixa a página (sitemap pediu), processa, descobre noindex, descarta. Para sites grandes (5570+ cidades × N marcas × M modelos), o desperdício se multiplica.
2. **Confusão de sinal de autoridade.** Linkar (sitemap conta como link interno do domínio) para uma URL noindex pode diluir autoridade que poderia ir para URLs indexáveis da mesma intenção.
3. **Risco de "Submitted URL marked 'noindex'"** no Search Console — alerta de qualidade que prejudica reputação do site no Google.
4. **Inconsistência entre superfícies SEO** — sitemap + meta robots + canonical formam um conjunto de sinais. Quando colidem, Google decide sozinho qual respeitar, e a decisão pode mudar entre crawls.

A regra geral aceita pela comunidade SEO: **só inclua no sitemap URLs que você quer indexadas**. Páginas `noindex` ficam fora.

---

## 4. Opções avaliadas

### Opção A — Skipar `city_brand` e `city_brand_model` no bootstrap inicial

| Aspecto | Detalhe |
|---|---|
| Mudança no transformer | Para `city_brand` e `city_brand_model`: retornar `null` (igual ao tratamento atual de `city_opportunities`). |
| Diff esperado | ~10-15 linhas em [cluster-plan-canonical-transform.js](../../src/modules/seo/planner/cluster-plan-canonical-transform.js) + ajustes em ~6-8 testes em [cluster-plan-canonical-transform.test.js](../../src/modules/seo/planner/cluster-plan-canonical-transform.test.js). |
| Comportamento do sitemap | `/sitemaps/brands.xml` e `/sitemaps/models.xml` continuam vazios (`<urlset></urlset>`) até reposicionamento. |
| Risco SEO | **Mínimo.** Sitemap deixa de fora 100% das URLs noindex — alinhamento perfeito. |
| Risco de processo | Mínimo. Permite o bootstrap rodar com escopo reduzido (só `city_home` + `city_below_fipe`) e validar incrementalmente antes de ampliar. |
| Cobertura inicial | 2 cluster_types em vez de 4 (skip de `city_opportunities` continua existindo). Por cidade: ~2 entries no sitemap (city_home + city_below_fipe). |
| Reversibilidade | Trivial — uma vez que brand/model forem reposicionadas (Opção B), basta voltar o transformer a preservar/transformar. |

### Opção B — Tornar `brand` e `brand_model` indexáveis em PR separado, depois persistir

| Aspecto | Detalhe |
|---|---|
| Mudança | Reposicionar [app/cidade/[slug]/marca/[brand]/page.tsx](../../frontend/app/cidade/[slug]/marca/[brand]/page.tsx) e [.../marca/[brand]/modelo/[model]/page.tsx](../../frontend/app/cidade/[slug]/marca/[brand]/modelo/[model]/page.tsx) (ou equivalentes) para emitir `index, follow` + canonical próprio. |
| Pré-requisitos | (a) Critério de estoque mínimo (vide §6); (b) auditoria de conteúdo (a página tem informação útil ou é placeholder?); (c) decisão de canonical (self ou consolidado?); (d) testes de geração de metadata; (e) política de title/H1. |
| Diff esperado | Grande — múltiplos arquivos, novos helpers, novos testes. Possivelmente migration ou nova engine de filtragem por estoque. |
| Risco SEO | Médio — depende da execução. Mal feito (páginas finas indexadas, conteúdo duplicado por cidade) pode atrair penalização de "thin content" ou "duplicate content" do Google. |
| Risco de processo | **Bloqueia o bootstrap inicial** indefinidamente. Brand/model ficam no caminho crítico de algo que poderia avançar incrementalmente. |
| Cobertura final | Ampla (todas as combinações cidade × marca × modelo com estoque mínimo). |
| Reversibilidade | Difícil — se desfazer canonicals indexados que o Google já cacheou exige Search Console + paciência. |

### Opção C — Persistir `city_brand` / `city_brand_model` mesmo com noindex

| Aspecto | Detalhe |
|---|---|
| Mudança | Nenhuma — transformer já preserva. Só rodar `--yes`. |
| Risco SEO | **ALTO.** Sinal contraditório explícito (sitemap pede indexação; meta robots nega). |
| Justificativa "válida"? | Nenhuma — não há benefício compensador. Mesmo "Googlebot decide sozinho" não é argumento; o resultado provável é desperdício de crawl + alerta no Search Console. |

---

## 5. Recomendação

**Opção A — Skipar `city_brand` e `city_brand_model` no bootstrap inicial.**

Justificativa:

1. **Alinhamento SEO perfeito** — sitemap deixa de fora 100% das URLs noindex.
2. **Não bloqueia o bootstrap** — `city_home` e `city_below_fipe` (que já estão alinhados com Fase 1 e são as canônicas indexáveis das principais intenções) podem ser persistidas imediatamente.
3. **Reversibilidade trivial** — quando brand/model forem reposicionadas via Opção B, basta voltar o transformer a transformar/preservar essas duas linhas.
4. **Reuso de padrão existente** — o transformer já tem o caminho de "skip" implementado para `city_opportunities`. Adicionar dois clusters a esse caminho é mudança mínima.
5. **Permite validação incremental** — primeiro rodada do bootstrap em staging cobre só 2 tipos × N cidades. Mais fácil de auditar manualmente, menos amostras para checar paths e robots.

Plano de execução (sem implementar nesta etapa):

- Ajustar transformer para retornar `null` em `city_brand` e `city_brand_model` (com comentário explicando que é decisão revisitável quando essas páginas forem reposicionadas).
- Atualizar testes do transformer e do script para refletir os novos `null`s e os novos contadores `totalSkipped`.
- Re-rodar dry-run em staging para validar contagens.
- Só então `--yes` em staging.

---

## 6. Critérios futuros para `brand` / `brand_model` indexáveis

Quando a Opção B for retomada (PR separado, fora do escopo deste runbook), exigir cumulativamente:

| Critério | Mínimo proposto | Justificativa |
|---|---|---|
| **Anúncios ativos para `brand`** | ≥ 3 (na cidade × marca) | Página com 1 ou 2 carros é "thin content" — pouco valor pro usuário, sinal ruim pro Google. |
| **Anúncios ativos para `brand_model`** | ≥ 3 (na cidade × marca × modelo) | Mesma razão. Páginas com 1 carro de Honda Civic em Atibaia são especialmente prováveis de virar duplicate (mesmo carro em outras URLs). |
| **Canonical próprio** | self | Cada combinação tem intenção única — não consolidar para `/cidade/[slug]` (perderia o "honda" da intenção). |
| **Robots** | `index, follow` | Pré-requisito da Opção B. Sem isso, Opção A continua valendo. |
| **Title sem duplicidade** | aplicar `stripSiteSuffix` (já feito em [territorial-seo.ts](../../frontend/lib/seo/territorial-seo.ts) na Fase 1) | Evita "Honda em Atibaia | Carros na Cidade | Carros na Cidade". |
| **Conteúdo útil mínimo** | listagem dos anúncios + filtros + descrição da intenção | Página não pode ser só `<h1>` + `<ul>` vazio. |
| **JSON-LD `ItemList`** | sim, com `numberOfItems` + amostra | Sinal estruturado para o Google entender que é página de catálogo. |
| **Não entrar no sitemap se ainda for `noindex`** | invariante absoluto | Princípio do §3 deste runbook. Se a página ainda for noindex, não persistir como cluster. |
| **Sample manual em 3 cidades** | aprovar layout/SEO antes de ampliar | Smoke equivalente ao [regional-page-rollout.md §8](./regional-page-rollout.md). |

Este conjunto deve ser revisado quando o PR de reposicionamento for aberto — pode ser mais rigoroso (ex.: ≥5 anúncios) dependendo do estoque real em prod.

---

## 7. Próximo prompt recomendado

> **Tarefa:** Implementar a Opção A deste runbook. Ajustar o transformer e os testes para skipar `city_brand` e `city_brand_model` no bootstrap inicial. **Sem rodar o script.**
>
> **Mudanças exatas:**
>
> 1. Em [src/modules/seo/planner/cluster-plan-canonical-transform.js](../../src/modules/seo/planner/cluster-plan-canonical-transform.js): trocar os `case "city_brand":` e `case "city_brand_model":` para retornarem `null` (igual a `city_opportunities`). Manter validação de campos obrigatórios (slug/brand/model) — ainda joga em dado inválido, só para que o caller não passe lixo silenciosamente. Atualizar comentários explicando que é skip TEMPORÁRIO até reposicionamento (Opção B do runbook [cluster-plan-brand-model-policy.md §4](./cluster-plan-brand-model-policy.md)).
>
> 2. Em [src/modules/seo/planner/cluster-plan-canonical-transform.test.js](../../src/modules/seo/planner/cluster-plan-canonical-transform.test.js):
>    - Trocar os testes "city_brand preserva …" e "city_brand normaliza brand …" por "city_brand → null (skip; brand/model ficam fora do bootstrap inicial até serem reposicionadas)".
>    - Trocar "city_brand_model preserva …" idem.
>    - Manter testes de fail-fast (`city_brand` sem brand → throw, etc) — validação ainda acontece antes do `null`.
>    - Adicionar 1 invariante novo: "todos os tipos exceto city_home e city_below_fipe retornam null no bootstrap inicial".
>
> 3. Em [tests/scripts/bootstrap-cluster-plans.test.js](../../tests/scripts/bootstrap-cluster-plans.test.js):
>    - Atualizar fixture `makePlan` se precisar (provavelmente não — só os contadores mudam).
>    - Atualizar o teste "totals refletem city_opportunities ignorados" para esperar **3 skipped por cidade** (city_opportunities + city_brand + city_brand_model) em vez de 1.
>    - Atualizar "limit=3 → 12 persistidos" para "limit=3 → 6 persistidos" (3 cidades × 2 tipos = 6).
>
> 4. Atualizar comentário em [docs/runbooks/cluster-planner-bootstrap.md §8](./cluster-planner-bootstrap.md) (saída esperada do dry-run) para refletir os novos contadores.
>
> 5. **NÃO alterar:** frontend, layout, components, sitemap em código, canonical em código, robots em código, rotas, ranking, planos, Página Regional, RUN_WORKERS, env, dados em prod, engine, worker. Apenas transformer + 2 test files + 1 doc.
>
> 6. **Validações obrigatórias:**
>    - `node --check` no transformer.
>    - `vitest run src/modules/seo/planner/cluster-plan-canonical-transform.test.js tests/scripts/bootstrap-cluster-plans.test.js` — todos passando.
>    - Regression em frontend Fase 1: 91/91 verdes.
>
> 7. **NÃO rodar o script** em ambiente algum nesta etapa. Próximo prompt depois deste decide quando/como rodar dry-run em staging com o transformer atualizado.
