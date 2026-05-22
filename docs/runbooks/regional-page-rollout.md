# Rollout da Página Regional — Carros na Cidade

> **Status:** Fase A implementada (rota + UI + admin). Fase C controlada
> documentada em
> [`regional-page-production-controlled-rollout.md`](regional-page-production-controlled-rollout.md)
> — runbook executável para ativar `REGIONAL_PAGE_ENABLED=true` em
> produção sem staging separado, mantendo `noindex,follow`, fora do
> sitemap, com rollback por flag em ≤ 1 min.
>
> **Raio configurável.** O raio usado para montar a região (default 80 km,
> range 10..150 km) é editável pelo admin em `/admin/regional-settings`.
> Persistido em `platform_settings.regional.radius_km`. Frontend NÃO
> passa radius — backend é fonte única de verdade.
>
> **Documento vivo.** Atualizar quando a flag for ligada em qualquer
> ambiente, e quando o critério de indexação for aprovado para Fase D.

---

## 1. Objetivo da Página Regional

A Página Regional existe para **liquidez e alcance comercial controlado**:
ampliar o estoque visível ao redor de uma cidade-base sem empurrar o
visitante para anúncios em outros estados ou regiões distantes.

- Mostra anúncios da **cidade-base + cidades próximas** (members de
  `region_memberships`, camada 1 ≤ 30 km e camada 2 entre 30 e 60 km).
- **Não** mistura UF distante automaticamente — a contenção territorial
  vem do próprio `region_memberships` no backend.
- O visitante continua podendo escolher livremente: cidade isolada, UF
  inteira, Brasil inteiro ou filtros arbitrários (`/comprar`).
- A Regional é uma **superfície a mais**, nunca uma substituição das
  páginas territoriais existentes.

---

## 2. Regra arquitetural — quatro superfícies territoriais

| Superfície      | Escopo                                                | Exemplo de URL atual                                            |
| --------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| **Estadual**    | UF inteira                                            | _(não existe ainda; futura)_                                    |
| **Regional**    | cidade-base + região aproximada (≤60 km)              | _(não existe ainda; futura — este runbook)_                     |
| **Cidade**      | local apenas (1 cidade)                               | `/comprar/cidade/[slug]`, `/cidade/[slug]`, `/carros-em/[slug]` |
| **Busca livre** | escolha do visitante (qualquer combinação de filtros) | `/comprar?...`                                                  |

**Cada superfície tem intenção SEO distinta.** A Regional **não** substitui
a Cidade; a Cidade **não** substitui a Estadual. Cada uma resolve uma
intenção de busca diferente e merece canonical próprio quando aprovada
para indexação.

---

## 3. Feature flag

- **Nome:** `REGIONAL_PAGE_ENABLED`.
- **Tipo:** server-only. Ler via [`isRegionalPageEnabled()`](../../frontend/lib/env/feature-flags.ts).
- **Default:** `false`.
- **Contrato estrito:** somente a string exata `"true"` minúscula liga a
  flag. `"TRUE"`, `"True"`, `"1"`, `"yes"`, `"sim"`, `" true "`, `""`,
  ausente — todos resolvem para `false`. Sem coerção indulgente: typo no
  painel do Render nunca liga a página por acidente.
- **Proibido `NEXT_PUBLIC_REGIONAL_PAGE_ENABLED`.** Vazaria no bundle JS
  público e revelaria o roadmap. O arquivo do módulo usa `import "server-only"`
  para que o build aborte se algum client component importar.
- A futura Página Regional **deve** chamar `isRegionalPageEnabled()` no
  topo do server component e devolver `notFound()` quando `false`.

---

## 4. URL regional — cravada

A URL canônica adotada é **`/carros-usados/regiao/[base-slug]`**, alinhada
ao padrão semântico das outras superfícies territoriais (`/carros-em/`).
Trocar esta URL depois de indexada implicaria 301 em massa — operação
que este rollout existe justamente para evitar.

| URL                            | Status                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `/carros-usados/regiao/[slug]` | **Canônica.** Implementada como `frontend/app/carros-usados/regiao/[slug]/page.tsx`. |
| `/regiao/[slug]`               | **Não usada.** Foi descartada em favor da canônica acima.                            |

---

## 5. Canonical durante o rollout

Cada fase tem regras explícitas. Não pular fases.

### Fase A — flag `false` (estado atual)

- A Página Regional **não deve ser servida publicamente.** A rota
  retorna `notFound()` por causa da flag.
- Se for servida por engano (bug, override de deploy), deve emitir
  `<meta name="robots" content="noindex, follow">`.
- **Não entra no sitemap.**
- Canonical pode apontar para `/comprar/cidade/[base.slug]` apenas como
  **proteção temporária** contra indexação cruzada — nunca como decisão
  definitiva de canonical da Regional.

### Fase B — flag `true` em staging

- Manter `noindex, follow`.
- **Não entra no sitemap.**
- Canonical da Regional ainda aponta para a Cidade-base como proteção
  até validação manual completa (ver checklist §8).

### Fase C — flag `true` em produção, rollout controlado

- Manter `noindex, follow`.
- **Não entra no sitemap** até aprovação explícita do responsável SEO.
- Logs e Search Console monitorados por pelo menos 1 ciclo de
  re-crawl (~7 dias) antes de qualquer mudança em canonical/robots.

### Fase D — Página Regional aprovada para indexação

- Página Regional ganha **canonical próprio** apontando para si mesma.
- Página da Cidade **mantém canonical próprio** apontando para si mesma.
- Uma deve linkar para a outra (link contextual no corpo, não rel=canonical).
- A Regional **nunca** substitui o canonical da Cidade. As duas convivem
  como superfícies distintas porque resolvem intenções distintas.

---

## 6. Regra de noindex

| Estado                                      | Robots                                                      |
| ------------------------------------------- | ----------------------------------------------------------- |
| Regional desabilitada (flag false)          | `noindex, follow` se servida acidentalmente                 |
| Regional em staging (flag true)             | `noindex, follow`                                           |
| Regional em produção antes da aprovação SEO | `noindex, follow`                                           |
| Regional aprovada para indexação            | `index, follow` **se** cumprir critério de estoque/conteúdo |

**Critério de estoque/conteúdo** (a definir formalmente antes da Fase D):
mínimo de N anúncios ativos na região, mínimo de M cidades-membro com
estoque, e diferença material de conteúdo vs. a Página da Cidade-base
(senão é página fina / quase-duplicata).

---

## 7. Regra de sitemap

A rota regional **não entra no sitemap** enquanto qualquer um destes for
verdadeiro:

- `REGIONAL_PAGE_ENABLED=false` em produção.
- Ambiente de staging.
- Rollout em produção com `noindex` ainda ativo.

A rota regional **só entra no sitemap** quando **todos** estes forem
verdadeiros:

- Flag `true` em produção.
- Canonical próprio definido (Fase D do §5).
- Página declaradamente indexável (`index, follow`).
- Critério de estoque/conteúdo cumprido (§6).
- Smoke manual aprovado (§8).
- Aprovação do responsável SEO registrada.

---

## 8. Checklist de rollout

Executar **em ordem**. Não pular itens.

1. **Validar env em produção:** `REGIONAL_PAGE_ENABLED=false`. Confirmar no
   painel Render do service do frontend.
2. **Validar `INTERNAL_API_TOKEN`:** mesma string nos services frontend
   **e** backend no Render. Sem isso, o BFF retorna `null` e a Regional,
   quando ligada, exibe vazio.
3. **Rodar smoke de regiões (API interna):** `npm run smoke:regions` do
   laptop com o token; e `npx vitest run lib/regions/` no frontend
   (deve passar 39 testes — 31 unitários + 8 smoke).
4. **Rodar smoke da Página Regional (HTML público):**
   `STAGING_PUBLIC_BASE_URL=https://<staging-frontend>.onrender.com EXPECT_FLAG=off npm run smoke:regional-page`
   primeiro, para confirmar 404 com flag desligada. Depois ligar a flag
   em staging e rodar com `EXPECT_FLAG=on` (default).
   Variáveis aceitas pelo script: `STAGING_PUBLIC_BASE_URL`,
   `STAGING_BASE_URL` (backend, opcional para o step admin),
   `REGIONAL_SMOKE_SLUGS` (CSV; default `atibaia-sp,campinas-sp,sao-paulo-sp`),
   `EXPECT_FLAG` (`on` ou `off`), `STAGING_ADMIN_EMAIL` /
   `STAGING_ADMIN_PASSWORD` (opcionais; só dispara o step admin),
   `STAGING_ALLOW_PATCH=true` (libera round-trip do PATCH no admin
   radius). O guard interno do script bloqueia hostnames de produção
   por default — só hostnames com `staging`, `preview`, `review`,
   `localhost` ou `127.0.0.1` passam (escape `ALLOW_PRODUCTION=true`
   existe mas é apenas para troubleshooting isolado, não para uso
   regular).
5. **Ligar `REGIONAL_PAGE_ENABLED=true` em staging.**
6. **Re-rodar smoke da Página Regional** com flag ligada
   (`EXPECT_FLAG=on`, default). Esperar PASS para os 3 slugs default
   (`atibaia-sp`, `campinas-sp`, `sao-paulo-sp`) + check 404 do slug
   inexistente. O smoke automatiza: status, robots, canonical,
   conteúdo essencial, presença de anúncios ou fallback, e chips de
   cidades vizinhas.
7. **Validação manual visual nas mesmas 3 cidades** (smoke não cobre):
   - `city_slugs[0]` é a cidade-base na query do `/api/ads/search`
     (DevTools → Network).
   - Anúncios da cidade-base aparecem **antes** dos das vizinhas dentro
     da mesma camada comercial (efeito de `baseCityBoostExpr`).
   - Não aparecem cidades de outra UF automaticamente.
   - **Layout não muda** vs. cidade isolada (header, footer, cards, grids).
8. **Só depois de tudo acima, considerar produção.**
9. **Em produção, ligar primeiro sem sitemap e mantendo `noindex`** (Fase C).
10. **Validar Search Console e logs** por pelo menos 1 ciclo de re-crawl
    (~7 dias). Procurar: erros 5xx, picos de latência, páginas finas
    sinalizadas, cobertura cruzada com Páginas de Cidade.
11. **Só depois liberar indexação e sitemap** (Fase D, §5 e §7).

---

## 9. O que é proibido durante o rollout

- ❌ **Não canonicalizar Cidade para Regional.** A Cidade tem intenção
  SEO própria; furar isso quebra o ranking atual.
- ❌ **Não emitir 301 antes de migração planejada.** 301 é irreversível
  na prática (cache de buscadores). Se algum dia a URL regional mudar,
  isso será uma migração separada, planejada, com seu próprio runbook.
- ❌ **Não colocar Regional no sitemap enquanto estiver com `noindex`.**
  Sitemap diz "indexe isto"; `noindex` diz "não indexe". Sinal contraditório
  prejudica crawl budget.
- ❌ **Não expor a flag como `NEXT_PUBLIC_*`.** Vaza no bundle e revela
  roadmap.
- ❌ **Não alterar layout no mesmo PR do rollout.** Rollout deve poder
  ser revertido sem desfazer trabalho de UI.
- ❌ **Não alterar planos comerciais no mesmo PR do rollout.** Mistura
  preocupações; complica rollback.
- ❌ **Não criar Página Regional competindo com páginas duplicadas
  atuais sem antes resolver canonical/noindex das rotas territoriais
  existentes** (`/comprar/cidade/[slug]`, `/cidade/[slug]`,
  `/carros-em/[slug]`, etc.). Senão, a Regional vira mais uma fonte de
  duplicação para o Google decidir sozinho.

---

## 10. Configuração administrativa do raio regional

A página usa raio dinâmico configurável pelo admin (default 80 km, range
10..150 km), não as constantes hardcoded de `region_memberships` (≤30/60 km).

### Arquitetura

- **Persistência:** tabela `platform_settings` (key/value JSONB) — migration
  `027_platform_settings.sql`. Key `regional.radius_km`. Seed inicial = 80.
- **Service:** `src/modules/platform/settings.service.js` (cache local 60s,
  fail-safe para default em caso de erro de leitura).
- **Endpoints admin:**
  - `GET /api/admin/regional-settings` → `{ radius_km, radius_min_km,
radius_max_km, radius_default_km }`.
  - `PATCH /api/admin/regional-settings` body `{ radius_km, reason? }` —
    valida 10..150, integer, transacional, audita em `admin_actions` com
    action `update_regional_radius`, invalida cache Redis `internal:regions:*`.
- **UI admin:** `/admin/regional-settings` (form com input number + botão
  salvar). Reaproveita layout/guard admin existente.
- **Backend regions:** `getRegionByBaseSlugDynamic()` em
  `src/modules/regions/regions.service.js` lê o raio internamente, faz
  haversine SQL contra `cities.latitude/longitude` filtrando por mesma UF,
  cap de `MAX_REGION_MEMBERS=30`. **Fallback** para `region_memberships`
  pré-computado quando: base sem lat/lon, haversine retorna 0 vizinhas, ou
  query haversine lança.
- **Frontend BFF:** `frontend/lib/regions/fetch-region.ts` propaga
  `radius_km` no `RegionPayload`. Não passa radius como query param —
  fonte única de verdade é o backend.

### Por que haversine dinâmico em vez de estender `region_memberships`?

- `region_memberships` é pré-computado offline (script
  `scripts/build-region-memberships.mjs`) com camadas hardcoded ≤30 km e
  30–60 km. Cada mudança de raio exigiria rebuild offline — incompatível
  com edição em tempo real pelo admin.
- Haversine SQL dinâmico contra `cities.latitude/longitude` (DOUBLE
  PRECISION, populadas via `npm run seed:cities-geo`) suporta range
  arbitrário (10..150) e respeita o admin. Sem PostGIS — usa bounding
  box em latitude + cálculo trigonométrico. Sem índice GIST.
- `region_memberships` permanece em uso por workers e dashboards
  (regional_cluster, regional_expansion) e como fallback automático na
  página pública.

## 11. Próxima etapa recomendada

A página existe em Fase A (flag `false` por default, `noindex,follow`
quando servida, fora do sitemap, sem CTAs públicos amplos). Próximas
etapas em ordem:

1. **Fase B em staging.** Ligar `REGIONAL_PAGE_ENABLED=true` em staging,
   rodar checklist §8 manualmente para Atibaia / Bragança Paulista /
   Mairiporã. Confirmar que `cities.latitude/longitude` está seedado
   (`npm run seed:cities-geo`). Verificar fallback funcional para cidades
   sem coords.
2. **Auditoria SEO de páginas territoriais existentes.** Antes de promover
   a Regional para Fase D (indexação), resolver duplicação canonical das
   rotas que já estão indexadas (`/comprar/cidade/[slug]`, `/cidade/[slug]`,
   `/carros-em/[slug]`, `/cidade/[slug]/oportunidades`,
   `/cidade/[slug]/abaixo-da-fipe`, `/carros-baratos-em/[slug]`,
   `/carros-automaticos-em/[slug]`). Senão, a Regional vira mais uma
   fonte de duplicação para o Google decidir sozinho.
3. **Fase C em produção** com `noindex` mantido. Monitorar Search Console
   e logs por 1 ciclo de re-crawl (~7 dias).
4. **Fase D — indexação.** Trocar canonical para self-canonical, remover
   `noindex`, incluir no sitemap regional (`/sitemaps/regiao/[state].xml`,
   já linkado mas vazio). Requer aprovação SEO formal e critério de
   estoque/conteúdo (§6).
