# Validação da Fase 1 dos Canonicals em Produção

> **Coletado em:** 2026-05-04 ~00:38 UTC contra `https://www.carrosnacidade.com`.
> **Status:** ✅ **APROVADO — Fase 1 está visível em produção.**
> **Pré-requisito desbloqueado:** [bootstrap-staging-dry-run-results.md](./bootstrap-staging-dry-run-results.md) §7 (Bloqueador 1).

---

## 1. Deploy validado

| Item | Valor |
|---|---|
| Branch alvo | `main` |
| HEAD do `main` (atual) | `dc4d32fb` — `fix(build): move helpers de sitemap para _lib (Next 14 route.ts proíbe export nomeado)` |
| Commit da Fase 1 dos canonicals | `24009155` — `fix(seo): Fase 1 — canonical/title de transição nas rotas territoriais`, autor 2026-05-03 21:53:49 UTC |
| Commit do fix de build (que destravou o deploy) | `dc4d32fb` — autor 2026-05-04 00:13:31 UTC |
| HEAD da resposta HTTP | `Date: Mon, 04 May 2026 00:38:33 GMT` (≈ 25min após `dc4d32fb`) |
| Status do deploy Render | **Não auditado via painel** (sem acesso direto). Inferido como SUCCESS via evidência de produção (ver §2 — HTML servido contém Fase 1; Date pós-commit) |
| Inclui Fase 1? | ✅ Sim, conforme `git log --oneline` mostra `24009155` em `main` antes de `dc4d32fb` |
| Inclui fix do build? | ✅ Sim, `dc4d32fb` é o HEAD |

**Comprovação por triangulação:**
- `git log --oneline` no worktree mostra `dc4d32fb` como HEAD de `main`, com `24009155` no histórico anterior.
- `gh api repos/.../commits/dc4d32fb` confirma o commit existe no remoto.
- HEAD `Date` da resposta HTTP é posterior ao timestamp do commit → resposta foi gerada por código já deployado.
- HTML retornado contém canonicals novos (§2) → comportamento da Fase 1 em uso.

---

## 2. Canonicals encontrados

| URL | Canonical esperado pós-Fase 1 ([territorial-canonical-audit.md §6](./territorial-canonical-audit.md)) | Canonical encontrado em prod | Robots encontrado | Aprovado? |
|---|---|---|---|---|
| `/cidade/atibaia-sp` | `…/carros-em/atibaia-sp` | **`https://www.carrosnacidade.com/carros-em/atibaia-sp`** | `noindex, follow` | ✅ |
| `/carros-em/atibaia-sp` | self (`…/carros-em/atibaia-sp`) | `https://www.carrosnacidade.com/carros-em/atibaia-sp` | `index, follow` | ✅ |
| `/cidade/atibaia-sp/abaixo-da-fipe` | `…/carros-baratos-em/atibaia-sp` | **`https://www.carrosnacidade.com/carros-baratos-em/atibaia-sp`** | `noindex, follow` | ✅ |
| `/carros-baratos-em/atibaia-sp` | self (`…/carros-baratos-em/atibaia-sp`) | `https://www.carrosnacidade.com/carros-baratos-em/atibaia-sp` | `index, follow` | ✅ |

**Comparação antes / depois do deploy:**

| URL | Antes (auditoria 2026-05-03 ~22:00) | Agora (2026-05-04 ~00:38) |
|---|---|---|
| `/cidade/atibaia-sp` | canonical = self ❌ | canonical = `/carros-em/atibaia-sp` ✅ |
| `/cidade/atibaia-sp/abaixo-da-fipe` | canonical = self ❌ | canonical = `/carros-baratos-em/atibaia-sp` ✅ |

**Validação extra com cache-bypass** (`Cache-Control: no-cache` + `?nocache=<timestamp>`):

```
$ curl -sSL -H "Cache-Control: no-cache" \
   "https://www.carrosnacidade.com/cidade/atibaia-sp?nocache=$(date +%s)" \
   | grep -oiE '<link[^>]*canonical|<meta[^>]*robots'

<meta name="robots" content="noindex, follow"/>
<link rel="canonical" href="https://www.carrosnacidade.com/carros-em/atibaia-sp"/>
```

→ **Idêntico à curl normal** — confirma que não é cache stale, é código novo no origin.

---

## 3. Headers de cache

Coletados via `curl -sSIL` em 2026-05-04 ~00:38 UTC.

| URL | HTTP | `Cache-Control` | `Age` | `cf-cache-status` | `ETag`/`Last-Modified` | Diagnóstico |
|---|---|---|---|---|---|---|
| `/cidade/atibaia-sp` | 200 | `private, no-cache, no-store, max-age=0, must-revalidate` | _(ausente)_ | `DYNAMIC` | _(ausente)_ | Origin força no-cache; CDN não cacheia (DYNAMIC). Toda request hits Render fresh. |
| `/carros-em/atibaia-sp` | 200 | mesmo | _(ausente)_ | `DYNAMIC` | _(ausente)_ | mesmo |
| `/cidade/atibaia-sp/abaixo-da-fipe` | 200 | mesmo | _(ausente)_ | `DYNAMIC` | _(ausente)_ | mesmo |

**Diagnóstico de cache:** zero risco de stale. `Cache-Control: no-cache, no-store` impede cache no client e no edge; `cf-cache-status: DYNAMIC` confirma Cloudflare não cachear; ausência de `Age` confirma que cada request é nova. Conclusão Fase 1 visível **não é** efeito de cache stale antigo — é HTML servido pelo código deployado.

(`Server: cloudflare`, `x-render-origin-server: Render` — origin direto via Render por trás do Cloudflare.)

---

## 4. Veredito

**✅ FASE 1 ESTÁ EM PRODUÇÃO.**

Justificativa em pirâmide:
1. **Comportamento observado:** 4 canonicals + 4 robots todos correspondem ao esperado pós-Fase 1.
2. **Cache eliminado como hipótese:** cache-bypass devolve resultado idêntico; headers indicam zero cache em camada nenhuma.
3. **Cronologia bate:** HTTP `Date` da resposta (00:38 UTC) é posterior ao commit `dc4d32fb` (00:13 UTC) que destravou o build, que por sua vez incluía `24009155` (Fase 1) já mergeado em `main` desde 21:53 UTC.
4. **Causa raiz do bloqueio anterior identificada e corrigida:** o build do Render estava falhando por causa dos exports inválidos em `route.ts` ([commit `dc4d32fb`](https://github.com/aguinaldodiversos-lgtm/carros-na-cidade-core/commit/dc4d32fb)). Sem build = sem deploy novo → prod ficou servindo HTML pré-Fase 1 por ~3h. Após o fix, build passou, deploy rolou, Fase 1 ficou visível.

**Caminhos NÃO escolhidos** (e por quê):
- ❌ "Fase 1 não está em produção" — falsificado pelos 4 canonicals novos servidos em prod.
- ❌ "Cache/CDN serve versão antiga" — falsificado pelo cache-bypass + headers DYNAMIC + `Cache-Control: no-cache, no-store`.
- ❌ "Deploy não incluiu commit correto" — `dc4d32fb` é o HEAD de `main`, foi pushado para `origin/main`, e a resposta HTTP tem `Date` posterior ao commit. Inferência overwhelming positiva.

---

## 5. Próximo passo

**Aprovado:** voltar ao runbook [bootstrap-staging-dry-run-results.md](./bootstrap-staging-dry-run-results.md) e re-avaliar os bloqueadores. Status atualizado:

| Bloqueador anterior | Status atual |
|---|---|
| **Bloqueador 1** — Fase 1 não deployada em prod | ✅ **RESOLVIDO** (este runbook) |
| **Bloqueador 2** — `city_brand` / `city_brand_model` são `noindex,follow` em prod | ⚠️ **Continua aberto** — não resolvido por este deploy. Política precisa ser decidida. |
| **Bloqueador menor (a)** — Schema real de `seo_cluster_plans` não confirmado | ⚠️ **Continua aberto** — operador deve rodar SQL via Render Shell. |
| **Bloqueador menor (b)** — Estado real de `seo_cluster_plans` não confirmado | ⚠️ **Continua aberto** — mesmo SQL. |

### Próximo prompt recomendado

> **Tarefa:** Decidir o que fazer com `city_brand` / `city_brand_model` (Bloqueador 2 do dry-run anterior) **sem implementar nada**. Criar runbook `docs/runbooks/cluster-plan-brand-model-policy.md` cobrindo:
>
> 1. **Diagnóstico atual** (já capturado em [bootstrap-staging-dry-run-results.md §6](./bootstrap-staging-dry-run-results.md)):
>    - 4 URLs `marca/...` em Atibaia: todas `noindex, follow` + canonical self.
>    - Transformer da Opção 2 PRESERVA esses paths.
>    - Persistir hoje meteria URLs noindex no sitemap (sinal contraditório).
>
> 2. **3 opções, com trade-offs:**
>    - **Opção A — Skipar `city_brand`/`city_brand_model` no transformer** (retorna `null`). Igual ao tratamento de `city_opportunities`. Sitemap brand/model continua vazio. Mais conservador.
>    - **Opção B — Reposicionar páginas brand/model como `index,follow` + canonical próprio** + persistir. Requer alterar `app/cidade/[slug]/marca/[brand]/page.tsx` etc — fora do escopo do runbook.
>    - **Opção C — Persistir mesmo com noindex** (deixar Googlebot decidir). Não recomendado — sinal contraditório.
>
> 3. **Recomendação:** Opção A para o bootstrap inicial; Opção B fica para PR posterior dedicado a brand/model SEO.
>
> 4. **NÃO alterar:** transformer, frontend, layout, components, sitemap em código, canonical em código, robots, rotas, ranking, planos, Página Regional. Apenas markdown + decisão arquitetural.
>
> 5. **Em paralelo (operador, ainda não-bloqueante):** rodar os SQLs read-only de [seo-cluster-plans-state-machine.md §1.3](./seo-cluster-plans-state-machine.md) via Render Shell de staging e atualizar o apêndice. Confirma `seo_cluster_plans` vazia + valida schema. Sem isso, `--yes` em staging é cego.

Após a decisão sobre brand/model + (opcionalmente) confirmação SQL, o caminho fica:

1. Implementar a Opção A (1 alteração no `cluster-plan-canonical-transform.js` + 2-4 linhas de teste).
2. Re-rodar dry-run em staging com `--limit=3` (agora seguro).
3. Rodar `--yes --limit=3` em staging.
4. Validar sitemaps em staging via curl.
5. Repetir em prod.
