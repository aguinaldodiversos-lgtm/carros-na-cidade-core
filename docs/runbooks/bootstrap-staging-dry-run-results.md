# Dry-run do Bootstrap de Cluster Plans

> **Coletado em:** 2026-05-03 contra `https://www.carrosnacidade.com` (curl read-only) + tentativa local do script.
> **Status:** **ADIADO.** Dois bloqueadores confirmados via produção (ver §8).

---

## 1. Ambiente

| Item | Valor |
|---|---|
| Ambiente alvo (intencional) | Staging — Render Shell de `carros-na-cidade-core` (staging) |
| Ambiente disponível para esta auditoria | **Apenas localhost (sem DB) + curl read-only contra `www.carrosnacidade.com` (prod)** |
| Sem acesso a | Render Shell de staging, `psql` em staging/prod, `DATABASE_URL` de qualquer ambiente |
| Por quê | Ambiente do assistente não tem `render` CLI, `psql` instalado, nem `.env.DATABASE_URL` (removido do git em commit `4250060` por segurança) |
| Data/hora | 2026-05-03, ~22:00 UTC (curls de produção) |
| Comando que SERIA executado | `node scripts/seo/bootstrap-cluster-plans.mjs --dry-run --limit=3` (no Render Shell de staging) |
| Comando efetivamente tentado localmente | mesmo, falhou no boot por env (ver §4) |
| `--yes` foi usado? | **NÃO.** Em ambiente algum. |
| Persistência ocorreu? | **NÃO.** `seo_cluster_plans` não recebeu nenhum INSERT/UPDATE. |

---

## 2. SQL antes do dry-run

> **Status: PENDENTE — operador deve rodar via Render Shell de staging e atualizar este apêndice.**

| Query | Resultado real | Esperado (baseado em código + curl de prod) |
|---|---|---|
| `SELECT COUNT(*) FROM seo_cluster_plans` | _(operador preencher)_ | **0** ou pequeno legado (5 endpoints prod via curl em [sitemap-empty-investigation.md](./sitemap-empty-investigation.md) confirmaram `data:[]`) |
| `SELECT cluster_type, status, COUNT(*) FROM seo_cluster_plans GROUP BY 1,2 ORDER BY 1,2` | _(operador preencher)_ | esperado: nenhuma linha |
| `SELECT COUNT(*) FROM cities` | _(operador preencher)_ | ~5570 (seed IBGE) |
| `SELECT COUNT(*) FROM ads WHERE status = 'active'` | _(operador preencher)_ | desconhecido — em [seo-cluster-plans-state-machine.md §1.3](./seo-cluster-plans-state-machine.md) tem o template |
| `SELECT COUNT(*) FROM ads WHERE status='active' AND city_id IS NOT NULL` | _(operador preencher)_ | provavelmente igual ou levemente menor |

Comandos copy-paste (já documentados em [seo-cluster-plans-state-machine.md §1.3](./seo-cluster-plans-state-machine.md)):

```sql
SELECT COUNT(*) AS total FROM seo_cluster_plans;

SELECT cluster_type, status, COUNT(*) AS total
FROM seo_cluster_plans
GROUP BY cluster_type, status
ORDER BY cluster_type, status;

SELECT COUNT(*) AS total FROM cities;
SELECT COUNT(*) AS total FROM ads WHERE status = 'active';
SELECT COUNT(*) AS total FROM ads WHERE status = 'active' AND city_id IS NOT NULL;
```

---

## 3. Schema de `seo_cluster_plans`

> **Status: PENDENTE — operador deve rodar e colar o resultado.**

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'seo_cluster_plans'
ORDER BY ordinal_position;
```

**Compatibilidade exigida por [`upsertClusterPlan`](../../src/modules/seo/planner/cluster-plan.repository.js)** (extraído via grep):

| Coluna | Tipo esperado | Pelo INSERT em `cluster-plan.repository.js:17-31` | Nullable? |
|---|---|---|---|
| `city_id` | inteiro (FK→cities) | `$1` | obrigatório |
| `cluster_type` | text | `$2` | obrigatório |
| `path` | text (UNIQUE — `ON CONFLICT (path)`) | `$3` | obrigatório |
| `brand` | text | `$4` | nullable (default `null`) |
| `model` | text | `$5` | nullable (default `null`) |
| `money_page` | boolean | `$6` (`Boolean(moneyPage)`) | obrigatório |
| `priority` | numérico | `$7` (`Number(priority \|\| 0)`) | obrigatório |
| `status` | text | `$8` (default `'planned'`) | obrigatório |
| `stage` | text | `$9` (default `'discovery'`) | obrigatório |
| `payload` | jsonb | `$10::jsonb` (`JSON.stringify(payload \|\| {})`) | obrigatório |
| `created_at` | timestamptz | `NOW()` | obrigatório |
| `updated_at` | timestamptz | `NOW()` (`DO UPDATE SET updated_at = NOW()`) | obrigatório |
| `last_generated_at` | timestamptz | NÃO escrita pelo upsert (mas é lida em `public-seo.service.js:70` no `COALESCE` do `lastmod`) | nullable provável |

**Risco se schema diverge em prod:** lembrar que [seo-cluster-plans-state-machine.md §1.2](./seo-cluster-plans-state-machine.md) já documentou que `seo_cluster_plans` **não tem migration oficial** — foi criada out-of-band. Schema real precisa ser confirmado antes do `--yes`. Se faltar `payload jsonb`, falha no INSERT. Se faltar `path UNIQUE`, `ON CONFLICT (path)` falha.

---

## 4. Output do dry-run

**Tentativa local**:

```
$ node scripts/seo/bootstrap-cluster-plans.mjs --dry-run --limit=3
file:///C:/.../src/config/env.js:70
    throw new Error(`[config] Variáveis de ambiente inválidas:\n${issues.join("\n")}`);

Error: [config] Variáveis de ambiente inválidas:
DATABASE_URL: Required
    at parseEnv (.../src/config/env.js:70:11)
    ...
```

**Diagnóstico**: `src/config/env.js` faz validação estrita no module load e lança antes do script chegar em `main()`. Esperado — sem `DATABASE_URL` configurada localmente, o script não consegue carregar o pool de conexão. **Isso é um sinal de saúde**, não bug — fail-fast no boot evita execução com env inválida.

**Evidência circumstancial** (do que o dry-run produziria com DB real):

Os testes unitários do script ([tests/scripts/bootstrap-cluster-plans.test.js](../../tests/scripts/bootstrap-cluster-plans.test.js)) com mocks demonstram o output esperado para 3 cidades. Conferido em runbook [cluster-planner-bootstrap.md §8](./cluster-planner-bootstrap.md):

```
[bootstrap-cluster-plans] iniciando {"limit":3,"dryRun":true}
[bootstrap-cluster-plans] DRY-RUN: nenhuma escrita ao banco. Use --yes para persistir.
[bootstrap-cluster-plans] plans construídos em memória {"totalCities":3}
[bootstrap-cluster-plans] transformação concluída {"totalGenerated":≈15-30,"totalTransformed":≈12-25,"totalSkipped":3,"totalToPersist":≈12-25,"totalErrors":0}
[bootstrap-cluster-plans] sample: city_home /cidade/atibaia-sp → /carros-em/atibaia-sp
[bootstrap-cluster-plans] sample: city_below_fipe /cidade/atibaia-sp/abaixo-da-fipe → /carros-baratos-em/atibaia-sp
[bootstrap-cluster-plans] sample: city_brand /cidade/atibaia-sp/marca/<brand_slug> → /cidade/atibaia-sp/marca/<brand_slug>
[bootstrap-cluster-plans] sample: city_brand_model /cidade/atibaia-sp/marca/<brand>/modelo/<model> → idem
[bootstrap-cluster-plans] DRY-RUN concluído. ≈12-25 plans seriam persistidos. Re-rodar com --yes para persistir.
```

(Variabilidade de `totalGenerated`: depende de quantas marcas/modelos a `cluster-planner.repository.js#listTopBrandsByCity` retorna pra cada cidade no `stage`, ver `cluster-planner.service.js#resolveBrandLimitByStage`.)

> **PENDENTE: operador deve colar o output REAL aqui após rodar em staging.**

---

## 5. Validação de paths (transformer)

Tabela baseada em comportamento determinístico do transformer
([cluster-plan-canonical-transform.js](../../src/modules/seo/planner/cluster-plan-canonical-transform.js))
+ testes
([cluster-plan-canonical-transform.test.js](../../src/modules/seo/planner/cluster-plan-canonical-transform.test.js),
20/20 passando):

| `cluster_type` | Path original (do builder) | Path transformado | Decisão | Aprovado? |
|---|---|---|---|---|
| `city_home` | `/cidade/atibaia-sp` | `/carros-em/atibaia-sp` | Reescreve para canônica intermediária Fase 1 | ⚠️ **Bloqueado por §7** (Fase 1 não deployada em prod) |
| `city_below_fipe` | `/cidade/atibaia-sp/abaixo-da-fipe` | `/carros-baratos-em/atibaia-sp` | Reescreve para canônica intermediária Fase 1 | ⚠️ **Bloqueado por §7** |
| `city_opportunities` | `/cidade/atibaia-sp/oportunidades` | `null` (skip) | Skip — canonicaliza pra mesma URL que below_fipe | ✅ Comportamento correto |
| `city_brand` | `/cidade/atibaia-sp/marca/<brand>` | preserva | Fase 1 não tocou | ⚠️ **Bloqueado por §6** (página é `noindex,follow` em prod) |
| `city_brand_model` | `/cidade/atibaia-sp/marca/<brand>/modelo/<model>` | preserva | Fase 1 não tocou | ⚠️ **Bloqueado por §6** (página é `noindex,follow` em prod) |

**Apenas `city_opportunities` (skip) está aprovado por design**. Os outros 4 dependem dos achados §6 e §7 abaixo.

---

## 6. Auditoria canonical das rotas brand/model em prod

| URL | HTTP | Canonical encontrado | Robots | Diagnóstico |
|---|---|---|---|---|
| `/cidade/atibaia-sp/marca/honda` | 200 | `…/cidade/atibaia-sp/marca/honda` (self) | **`noindex, follow`** | Página atual é noindex. Persistir esse path no sitemap publicaria URL noindex no XML — sinal contraditório (sitemap diz "indexe", meta diz "não indexe"). |
| `/cidade/atibaia-sp/marca/honda/modelo/civic` | 200 | `…/cidade/atibaia-sp/marca/honda/modelo/civic` (self) | **`noindex, follow`** | Mesma situação. |
| `/cidade/atibaia-sp/marca/vw%20-%20volkswagen` | 200 | `…/cidade/atibaia-sp/marca/vw%20-%20volkswagen` (self) | `noindex, follow` | Mesma situação + path com espaço (já encoded — bug existente, fora do escopo). |
| `/cidade/atibaia-sp/marca/fiat` | 200 | `…/cidade/atibaia-sp/marca/fiat` (self) | `noindex, follow` | Mesma situação. |

**Diagnóstico:** rotas brand/model estão **todas sob `noindex, follow` em prod**. O transformer atual da Opção 2 PRESERVA esses paths, o que significa que rodar `--yes` populariam `seo_cluster_plans` com `city_brand`/`city_brand_model` cujos paths o sitemap depois publicaria — mas o frontend serve a página com `noindex`. Inconsistência SEO.

**Decisão derivada:** transformer precisa ser refinado para **skipar** `city_brand` e `city_brand_model` também (retornar `null`) até que essas páginas sejam reposicionadas como indexáveis OU até que a política de canonical das brand/model seja decidida (fora do escopo desta etapa).

---

## 7. Auditoria canonical da Fase 1 em prod

| URL | Canonical encontrado | Robots | Esperado pós-Fase 1 (commit `24009155`) | Status do deploy |
|---|---|---|---|---|
| `/cidade/atibaia-sp` | `…/cidade/atibaia-sp` (**self**) | `noindex, follow` | canonical = `…/carros-em/atibaia-sp` | ❌ **Fase 1 NÃO deployada** |
| `/carros-em/atibaia-sp` | `…/carros-em/atibaia-sp` (**self**) | `index, follow` | canonical = self | ✅ OK (esperado mesmo pré-Fase 1, pois `local-seo-metadata` antiga também canonicalizava — porém para `/comprar/cidade/[slug]`. Conferir abaixo.) |
| `/cidade/atibaia-sp/abaixo-da-fipe` | `…/cidade/atibaia-sp/abaixo-da-fipe` (**self**) | `noindex, follow` | canonical = `…/carros-baratos-em/atibaia-sp` | ❌ **Fase 1 NÃO deployada** |
| `/carros-baratos-em/atibaia-sp` | `…/carros-baratos-em/atibaia-sp` (**self**) | `index, follow` | canonical = self | ✅ OK (esperado mesmo pré-Fase 1, conferir bug "antes/depois" abaixo) |

**Wait — `/carros-em/[slug]` e `/carros-baratos-em/[slug]` retornam canonical SELF.** Isso é **compatível com a Fase 1** (que fez essas duas serem self-canonical). Mas era ALSO compatível com a auditoria pré-Fase 1 ([territorial-canonical-audit.md §3](./territorial-canonical-audit.md)) que mostrou:
- `/carros-em/atibaia-sp` → canonical `/carros-em/atibaia-sp` (self) — **antes da Fase 1**

Então essas duas URLs sempre foram self-canonical. **Mas a Fase 1 mudou o `local-seo-metadata.transitionCanonicalPath`** para que `/carros-em` aponte pra self em vez de pra `/comprar/cidade/`. O fato de prod mostrar self pode significar:
- (a) Fase 1 está deployada e funcionando (esperado)
- (b) prod já estava self-canonical por outro motivo (improvável; auditoria anterior mostrou exatamente o oposto pra `/comprar/cidade/[slug]?sort=recent&limit=50` que era a antiga canônica)

**Mas para `/cidade/atibaia-sp` o teste é decisivo:** a Fase 1 mudou `transitionCanonicalPath(slug)` para retornar `/carros-em/[slug]`. Prod ainda retorna self-canonical = bug deployment. **Fase 1 está parcialmente deployada ou não deployada.**

Possíveis causas:
- (i) Render auto-deploy não rolou ainda (commit recente, ainda no pipeline).
- (ii) Cache CDN segurando HTML antigo (Cloudflare s-maxage=3600+swr=86400 do path).
- (iii) Cache do Next ISR (1h padrão).
- (iv) Deploy falhou silenciosamente.

**Diagnóstico final:** seja qual for a causa, **prod NÃO reflete Fase 1 hoje**. Persistir paths novos (`/carros-em/[slug]`) no sitemap antes de Fase 1 estar visivelmente deployada cria descompasso: sitemap publica `/carros-em/[slug]`, frontend ainda serve `/cidade/[slug]` como self-canonical → Googlebot vê duas URLs disputando a mesma intenção sem sinal claro de qual canonicaliza qual.

---

## 8. Decisão

**ADIAR — duas razões independentes, ambas suficientes para bloquear:**

1. **Fase 1 dos canonicals não está deployada em prod** (§7). Persistir agora cria descompasso entre sitemap e canonicals servidos.
2. **`city_brand` / `city_brand_model` estão `noindex,follow` em prod** (§6). O transformer atual preserva esses paths, mas persistir os colocaria no sitemap como URLs noindex — sinal contraditório.

**Outros bloqueadores menores (não decisivos por si só):**

- (a) Schema real de `seo_cluster_plans` em prod não confirmado (§3 PENDENTE). Não há migration oficial — schema é out-of-band, conforme [seo-cluster-plans-state-machine.md §1.2](./seo-cluster-plans-state-machine.md).
- (b) Estado real da tabela em prod não confirmado (§2 PENDENTE). Embora a hipótese seja "vazia", confirmação SQL evita ação cega.
- (c) Output real do dry-run em staging não capturado — assistente não tem acesso a Render Shell. §4 mostra apenas a tentativa local que falhou no boot por env.

**Caminhos NÃO escolhidos (e por quê):**

- ❌ **Aprovado para rodar `--yes --limit=3` em staging** — não. Múltiplos bloqueadores acima.
- ❌ **Adiar e ajustar transformer** — sozinho não resolve. Precisa esperar Fase 1 deployada também.
- ❌ **Adiar por schema incompatível** — sozinho não bloqueia (provavelmente compatível, mas não confirmado).

**Caminho escolhido:**

- ✅ **Adiar porque Fase 1 não está deployada** (bloqueador principal) **+ ajustar transformer para skipar `city_brand`/`city_brand_model`** (bloqueador secundário; afeta o desenho do script).

---

## 9. Próximo prompt recomendado

> **Tarefa:** Investigar por que a Fase 1 dos canonicals (commit `24009155`, mergeado em `main` em 2026-05-03) **não está visível em prod** apesar de estar no `main`. Sem alterar código, apenas leitura/observação.
>
> 1. **Verificar status de deploy do Render** para o serviço `frontend` (web service do Next.js):
>    - `gh api /repos/aguinaldodiversos-lgtm/carros-na-cidade-core/deployments?per_page=10` ou pelo painel Render manualmente.
>    - Quando foi o último deploy? Status (success/failed/in_progress)?
>    - O último deploy é >= o commit `24009155`?
>
> 2. **Forçar bypass de cache CDN** e re-curl:
>    ```bash
>    curl -sSL --max-time 25 -H "Cache-Control: no-cache" -H "Pragma: no-cache" \
>      "https://www.carrosnacidade.com/cidade/atibaia-sp?nocache=$(date +%s)" \
>      | grep -oiE '<link[^>]*rel="canonical"[^>]*>'
>    ```
>    Comparar com a curl sem bypass. Se mudou: cache CDN/Next stuck. Se igual: deploy não rolou.
>
> 3. **Documentar** em runbook novo `docs/runbooks/fase1-deploy-investigation.md`:
>    - Resultado da investigação de deploy (Render).
>    - Resultado do bypass de cache.
>    - Causa raiz: deploy pendente, deploy falho, cache stuck, ou outro?
>    - Recomendação de próxima ação (esperar deploy, purge cache, re-trigger build, etc).
>
> 4. **Em paralelo** (independente, pode ser PR separado): criar runbook
>    `docs/runbooks/cluster-plan-brand-model-policy.md` decidindo o que fazer
>    com `city_brand`/`city_brand_model`:
>    - Reposicionar páginas como `index,follow` (com canonical próprio + JSON-LD)?
>    - Manter `noindex` e skipar do bootstrap (transformer retorna `null`)?
>    - Trade-offs.
>
> 5. **Só depois** de Fase 1 confirmadamente deployada **+** decisão sobre brand/model documentada, voltar a este runbook (`bootstrap-staging-dry-run-results.md`) e:
>    - Atualizar §2/§3 com SQL real do operador.
>    - Re-rodar dry-run em staging (com DATABASE_URL configurado).
>    - Atualizar §4 com output real.
>    - Atualizar §5/§8 com decisão final (provavelmente: aprovar `--yes --limit=3` em staging).
>
> 6. **NÃO alterar:** frontend, layout, components, sitemap em código, canonical em código, robots, rotas, ranking, planos, Página Regional, `RUN_WORKERS`, env, dados em prod, código backend nesta etapa. Apenas leitura, curls, e markdown.
