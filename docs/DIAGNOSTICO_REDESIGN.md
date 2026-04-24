# DIAGNÓSTICO — Redesign Mobile-First do Portal Carros na Cidade

**Data**: 2026-04-24
**Versão**: 2 (endurecida)
**Branch**: `claude/sad-elbakyan-8155e1`
**Etapa**: 1 — Diagnóstico e contrato operacional (sem edição de código)
**Escopo**: Frontend Next.js 14 App Router

---

## 📋 Checklist de endurecimento aplicado

Esta versão 2 corrige a versão 1 com 11 ajustes obrigatórios:

| # | Ajuste | Endereçado em |
|---|---|---|
| 1 | Reclassificar `services/` → `lib/` como refactor estrutural em 4 sub-PRs | §15 |
| 2 | Criar Fase 0A — Contratos de estabilidade antes da limpeza | §8 |
| 3 | Corrigir ordem dos PRs (A–O) | §14 |
| 4 | Separar redesign público (Trilha 1) de segurança/admin (Trilha 2) | §7, §14 |
| 5 | Endurecer critérios para deletar código morto | §13 |
| 6 | Design system como contrato (tokens + primitivos + regras) | §9 |
| 7 | Contrato do `<AdCard>` com 8 variantes | §10 |
| 8 | Regra de BottomNav (onde aparece, onde não, exceções) | §11 |
| 9 | Contrato de performance mobile (metas como obrigações) | §12 |
| 10 | Estimativa em 3 camadas (MVP / pública / completa) | §18 |
| 11 | "O que pode começar agora vs o que está bloqueado" | §19 |

---

## 0. Sumário executivo

O portal tem **arquitetura madura, mas acúmulo crítico de dívida técnica** que exige tratamento **antes** de qualquer mudança visual:

- **Duplicações estruturais**: shell em 3 níveis, 5 variações de card de anúncio, 9 serviços duplicados entre `lib/` e `services/`, 2 dashboards paralelos.
- **Camada SSR frágil**: 4 incidentes recentes (cold start, rate limit 429, propagação de IP). `ssrResilientFetch` é obrigatório em toda página pública SSR.
- **SEO massivo em risco**: sitemap dinâmico alimenta 5.500+ URLs; canonical, breadcrumb e redirects 301 são invioláveis.
- **`/favoritos` com `"use client"`** inadequado, admin 100% client-side (anti-padrão de segurança e SEO).

**Veredito operacional**:

1. **Redesign é viável, mas bloqueado por contratos**. Antes de qualquer PR que altere código ou visual, é obrigatório consolidar 5 contratos (rotas canônicas, SEO, SSR, imagens, design system). Sem isso, redesign cresce sobre fundação duplicada e quebra SEO silenciosamente.

2. **Duas trilhas paralelas, uma não bloqueia a outra**:
   - **Trilha 1** — Redesign público (SEO + conversão): home, comprar, cidade, detalhe, FIPE, simulador, blog, publicação, cards, imagens.
   - **Trilha 2** — Segurança/auth/admin: admin client-only, middleware server, dashboard PF/PJ, sessão, cookies, isolamento, permissões.

3. **`services/` → `lib/` NÃO é limpeza**, é refactor estrutural. Quebrar em 4 sub-PRs por domínio (0.4A inventário → 0.4B baixo risco → 0.4C ads/vehicle → 0.4D auth/session). Não misturar com PRs visuais.

4. **Nenhum componente é deletado sem prova**. Sete checks obrigatórios antes de remover qualquer arquivo.

5. **15 PRs em ordem segura**, A–O, cada um deploycável e reversível independentemente. MVP visual entregável em 15-25 dias (PRs A–G). Reconstrução pública principal em 30-45 dias (A–M). Reconstrução completa, incluindo Trilha 2, em 45-60 dias.

---

## 1. Stack oficial (sem mudança)

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js | 14.2.35 (App Router) |
| Runtime | React | 18.3.1 |
| Linguagem | TypeScript | ✓ |
| CSS | Tailwind CSS | 3.4.19 |
| Testes | Playwright + Vitest | ✓ |
| Imagens | Sharp + next/image + R2 (AWS S3 SDK) | ✓ |
| Cache | ioredis (instalado, **não usado em BFF**) | 5.9.3 |
| Carousel | embla-carousel-react | 8.6.0 |

Stack é adequada. Nenhuma atualização de framework é necessária.

---

## 2. Inventário de rotas (`app/`)

### 2.1. Páginas públicas indexáveis (SEO-críticas)

| Rota | Renderização | Metadata | Linhas | Status |
|---|---|---|---|---|
| `/` | ISR 300s | ✓ | 50 | ✓ OK |
| `/anuncios` | ISR 60s | ✓ | 87 | ✓ **Canônica** |
| `/veiculo/[slug]` | ISR 1800s | ✓ | **456** | ⚠️ Gigante — extrair AI para `lib/vehicle/ai/` antes do redesign |
| `/cidade/[slug]` + sub-rotas | Server (no-cache) | ✓ | 32-42 | ✓ OK |
| `/comprar/[slug]` | ISR 60s | ✓ | ~80 | ⚠️ Alias duplicado |
| `/comprar/cidade/[slug]` | ISR 60s | ✓ | 292 | ⚠️ Paralelo — ROUTE_CANONICAL_MAP resolve |
| `/comprar/estado/[uf]` | ISR 60s | ✓ | 188 | ⚠️ Paralelo |
| `/carros-em/[slug]`, `/carros-baratos-em/[slug]`, `/carros-automaticos-em/[slug]` | ISR LOCAL_SEO | ✓ | 8 (factory) | ✓ OK |
| `/blog` + `/blog/[cidade]` | Server + ISR 300s | ✓ | ~30 / 128 | ✓ OK |
| `/tabela-fipe` + `/tabela-fipe/[cidade]` | Server + ISR 300s | ✓ | ~20 / 102 | ✓ OK |
| `/simulador-financiamento` + `[cidade]` | Server + ISR 300s | ✓ | ~20 / 151 | ✓ OK |
| `/planos` | ISR 900s | ✓ | 109 | ✓ OK |

### 2.2. Páginas institucionais

Todas com `generateMetadata`, Server Components, estrutura consistente:
`/como-funciona`, `/sobre`, `/contato`, `/ajuda`, `/seguranca`, `/politica-de-privacidade`, `/termos-de-uso`, `/lgpd`.

### 2.3. Autenticação

| Rota | Issue |
|---|---|
| `/login`, `/cadastro`, `/recuperar-senha` | ✓ Server, com metadata |
| `/favoritos` | 🚨 `"use client"` no topo — única página pública client-only. **Trilha 2 resolve**. |

### 2.4. Fluxo de anúncio

| Rota | Status |
|---|---|
| `/anunciar` | Landing |
| `/anunciar/novo` | Wizard oficial (force-dynamic) |
| `/anunciar/publicar` | ⚠️ Redundante? Auditar no PR A |
| `/painel/anuncios/novo` | 🚨 Redirect puro — remover no PR C (após prova) |

### 2.5. Dashboards (2 arquiteturas paralelas)

- `/dashboard/*` (PF)
- `/dashboard-loja/*` (lojista)

Ambos usam `AccountPanelShell` com variantes. Duplicação tratada no **PR N** (Trilha 1 — visual) e **Trilha 2** (arquitetura/segurança).

### 2.6. Admin (client-only, anti-padrão)

8 páginas em `/admin/*`, todas `"use client"`, protegidas por `useAdminGuard()` (bypasseável). **NÃO é tocada em PRs A–O**. Fica na Trilha 2.

### 2.7. APIs BFF (`app/api/`)

~30 routes em: auth, cities, ads, fipe, dashboard, painel, payments, plans, vehicle-images, admin (catch-all), diag, sitemap. Maioria com `force-dynamic`. Redis instalado mas não usado.

### 2.8. Sitemaps

11 routes: `sitemap.xml` (index) + 9 temáticos + `regiao/[state].xml` dinâmico. Cache trivial de 300s — endurecer no **Contrato SEO** (§8.3).

---

## 3. Mapa de componentes (`components/`)

**Total**: 119 componentes em 25 domínios (71 Client, 48 Server — 60/40).

### 3.1. Duplicação crítica #1 — Shell em 3 níveis

```
components/Header.tsx              (54 bytes — re-export estéril)
    ↓
components/layout/Header.tsx       (4.7 KB — aparentemente órfão)
    ↓
components/shell/PublicHeader.tsx  (10.5 KB — OFICIAL, usado em app/layout.tsx)
```

**Tratamento**: PR C, após checklist de §13 (critérios endurecidos).

### 3.2. Duplicação crítica #2 — 5 cards de anúncio

| Card | Usa AdCard? | Propósito | Tratamento |
|---|---|---|---|
| `ads/AdCard.tsx` | — (base) | Canônico com `BaseAdData` | ✓ Manter |
| `ads/CarCard.tsx` | ✓ adapter | Compat legado | ✓ Manter (adapter) |
| `common/VehicleCard.tsx` | ✓ adapter | `ListingCar → AdCard` | ✓ Manter (adapter) |
| `home/HomeVehicleCard.tsx` | ✗ reimplementa | Home com variantes | PR F — refatorar como variante |
| `buy/CatalogVehicleCard.tsx` | ✗ reimplementa | Catálogo com `weight` | PR F — refatorar como variante |
| `home/sections/VehicleCard.tsx` | ✗ sexta cópia | Duplicação de HomeVehicleCard | PR F — eliminar |

Contrato de variantes em §10.

### 3.3. Duplicação crítica #3 — `lib/*` vs `services/*`

| Função | `lib/` | `services/` | Destino canônico |
|---|---|---|---|
| Ads | ✓ `lib/ads/` | ✓ `adService.ts` | `lib/ads/` |
| Auth | ✓ `lib/auth/` | ✓ `authService.ts` | `lib/auth/` |
| Session | ✓ `lib/session/` | ✓ `sessionService.ts` | `lib/session/` |
| Vehicle | ✓ `lib/vehicle/` | ✓ `vehicleService.ts` | `lib/vehicle/` |
| Plans | ✗ | ✓ `planService.ts` + `planStore.ts` | criar `lib/plans/` |
| AI | ✗ | ✓ `aiService.ts` | criar `lib/ai/` |
| Market | ✗ | ✓ `marketService.ts` | criar `lib/market/` |

**Violação explícita** do PROJECT_RULES. Migração em §15 — **refactor estrutural**, não limpeza.

### 3.4. Componentes candidatos a órfão (~13) — **NENHUM é removido sem prova**

Lista inicial (a ser validada pelo checklist de §13):

- `ads/AdDetailsPage.tsx`, `ads/AdListingCard.tsx`
- `common/CTASection.tsx`, `FAQSection.tsx`, `FinancingSimulator.tsx`, `RegionalEntryHub.tsx`, `StatsSection.tsx`
- `buy/BuyPageShell.tsx`, `buy/VehicleBadge.tsx`
- `fipe/FipeVehicleCarousel.tsx`
- `modal/ExitIntentModal.tsx`
- `painel/new-ad-wizard/WizardSteps.tsx`
- `admin/AdminActionDialog.tsx`, `AdminEmptyState.tsx`, `AdminErrorState.tsx`, `AdminLoadingState.tsx`
- `layout/TerritorialHeaderLinks.tsx`

**Cada item precisa passar pelos 7 checks de §13 antes de deletar**. Sem exceção.

### 3.5. Padrões positivos (referências arquiteturais)

- **`components/search/TerritorialResultsPageClient.tsx`**: melhor arquitetura do repo — usar como modelo.
- **Tailwind 100%**: sem CSS modules, sem styled-components.
- **PascalCase em arquivos**: 99% consistente.
- **2 contextos apenas** (`CityContext`, `FavoritesContext`).
- **`ssrResilientFetch`**: exemplar para lidar com cold start e 429.

---

## 4. Riscos técnicos (reclassificados)

### 🔴 CRÍTICO

| # | Risco | Trilha | Mitigação |
|---|---|---|---|
| 1 | SSR cold start (Next default 10s, backend 20-40s) | 1 e 2 | **Contrato SSR §8.4** — toda página pública SSR usa `ssrResilientFetch` |
| 2 | Rate limit 429 global (container IP) | 1 e 2 | Verificar `AUTH_SESSION_SECRET` em prod; monitorar 429 |
| 3 | Sitemap falha silenciosa | 1 | **Contrato SEO §8.3** — logar fallback, não engolir com `try/catch` mudo |
| 4 | Auth isolation breach (BFF) | 2 | Code review em todo `/app/api/painel/**`; E2E `user-isolation-api.spec.ts` |
| 5 | URLs com mudança sem redirect 301 | 1 | **ROUTE_CANONICAL_MAP §8.1** — mapear antes de qualquer renomeação |
| 6 | `services/` → `lib/` como refactor amplo | 1 e 2 | **§15 — 4 sub-PRs fatiados**, nunca um PR único |

### 🟠 ALTA

| # | Risco | Trilha | Mitigação |
|---|---|---|---|
| 7 | Breadcrumb/JSON-LD removido no redesign | 1 | Contrato SEO; teste E2E de presença |
| 8 | Canonical quebrado | 1 | Contrato SEO; validar em cada PR |
| 9 | `/favoritos` client-only | 2 | Migrar para server com Suspense (Trilha 2) |
| 10 | Admin client-only + guard fraco | 2 | Migrar `useAdminGuard()` → middleware server (Trilha 2) |
| 11 | `/veiculo/[slug]` 456 linhas + AI embutida | 1 | Extrair para `lib/vehicle/ai/` antes do PR I |

### 🟡 MÉDIA

| # | Risco | Trilha | Mitigação |
|---|---|---|---|
| 12 | Bundle sem análise | 1 | Adicionar `next/bundle-analyzer` em dev (PR B) |
| 13 | Zero `dynamic()` import | 1 | Contrato de performance §12 |
| 14 | `sizes` ausente em imagens | 1 | **Contrato de imagens §8.5** |
| 15 | `remotePatterns: **` permissivo | 1 e 2 | Restringir em PR B |
| 16 | Sem banner LGPD | 1 e 2 | Implementar antes de tracking |
| 17 | Redis instalado mas não usado | 1 e 2 | Opcional — cache de FIPE, facets, cidades |

### 🟢 BAIXA

| # | Risco |
|---|---|
| 18 | `globals.css` 362 linhas — possível duplicação de cores |
| 19 | E2E sem testes de falha SSR |
| 20 | Revalidate times inconsistentes sem justificativa |

---

## 5. Páginas intocáveis (contrato de estabilidade)

Estas páginas **não podem regredir** em nenhum PR. **Snapshot obrigatório antes de qualquer mudança** (ver §8.2).

1. **`/`** — cabeça do funil
2. **`/veiculo/[slug]`** — página de conversão #1
3. **`/comprar/cidade/[slug]`** — 500+ páginas SEO por cidade
4. **`/cidade/[slug]`** — entrada territorial
5. **`/anuncios`** — listagem canônica
6. **`/sitemap.xml`** + todos os `/sitemaps/*.xml`
7. **`/api/auth/login`** — todo fluxo logado depende
8. **`/anunciar/novo`** — wizard de monetização
9. **`/dashboard/meus-anuncios`** — retenção de vendedores
10. **Middleware de redirect legado** (`/carros-em-*` hifenizado)

Cada página intocável tem pelo menos um E2E spec que a valida (§6). PR que alterar essas páginas **obriga** execução do spec correspondente antes do merge.

---

## 6. Testes existentes (contrato)

**11 specs Playwright**, 9 invioláveis:

| Spec | @smoke | Fluxo | Página intocável coberta |
|---|---|---|---|
| `main-flow.spec.ts` | ✓ | Cadastro → publicação → detalhe | /, /anuncios, /veiculo/[slug], /anunciar/novo |
| `full-flow.spec.ts` | ✓ | Variante estendida | Idem |
| `dashboard-login-pf-pj.spec.ts` | ✓ | Login PF + PJ | /dashboard/meus-anuncios |
| `10-login-ad-publish.spec.ts` | — | Login → publicar | /api/auth/login, /anunciar/novo |
| `20-login-ad-checkout.spec.ts` | — | Login → checkout | /api/auth/login |
| `register-minimal-to-publish.spec.ts` | — | Cadastro mínimo | /anunciar/novo |
| `publish-full-surface.spec.ts` | — | Publicação completa | /anunciar/novo |
| `user-isolation-api.spec.ts` | — | 🔒 Isolamento | BFF painel |
| `anunciar-redirect.spec.ts` | — | Redirect legado | Middleware |
| `vehicle-detail-premium.spec.ts` | — | Detalhe premium | /veiculo/[slug] |
| `critical-pj-flow.spec.ts` | — | Placeholder | — |

### Cobertura faltante (adicionar no PR B — Testes de proteção)

- Teste de SSR timeout (backend cold start simulado)
- Teste de sitemap.xml gerado corretamente (todas as 9 seções)
- Teste de canonical URL em 10 páginas públicas
- Teste de presença de JSON-LD/breadcrumb
- Teste de que nenhuma página pública usa `fetch` cru (apenas `ssrResilientFetch`)

---

## 7. Trilhas de trabalho

Redesign tem **duas trilhas independentes que podem correr em paralelo**. Admin client-only não trava redesign público.

### 7.1. Trilha 1 — Redesign público (SEO + conversão)

**Escopo**:
- Home
- Comprar estadual
- Comprar por cidade
- Páginas territoriais (`/cidade/[slug]/**`)
- Detalhe do veículo
- FIPE
- Simulador de financiamento
- Blog
- Publicação de anúncio (`/anunciar/novo`)
- Painel visual (PF + lojista)
- Login/cadastro/recuperar senha (visual apenas)
- `<AdCard>` unificado
- Componente único de imagem
- Design system + tokens

**PRs**: A – N

### 7.2. Trilha 2 — Segurança, auth, admin (paralela)

**Escopo**:
- `useAdminGuard()` → middleware server
- `/favoritos` client-only → server com Suspense
- Dashboard PF/PJ: arquitetura duplicada → avaliação de unificação
- Refresh token silencioso → telemetria
- Isolamento de dados no BFF
- Cookies, permissões, LGPD banner
- `services/` → `lib/` (§15, mesmo sendo estrutural)

**PRs**: O + backlog de segurança (data livre, não bloqueia Trilha 1)

### 7.3. Regra de separação

- **Nenhum PR visual (D–N) toca código de auth/admin/middleware**.
- **Nenhum PR de Trilha 2 toca layout visual**.
- Commit que violar a regra volta pra revisão.

---

## 8. Fase 0A — Contratos de estabilidade

**Esta fase vem antes de qualquer remoção, migração ou mudança visual.** Todos os contratos são entregues no **PR A**.

### 8.1. ROUTE_CANONICAL_MAP.md

Documento novo em `docs/ROUTE_CANONICAL_MAP.md`. Estrutura obrigatória:

| Rota atual | Função | Indexável? | Canonical esperado | Aliases | Redirects 301 necessários | Pode ser removida? |
|---|---|---|---|---|---|---|
| `/anuncios` | Listagem canônica | ✓ | `/anuncios?...` | — | — | Nunca |
| `/comprar` | Entry territorial | ✓ | `/anuncios` ou `/cidade/{slug}` | — | resolver | Após mapeamento |
| `/comprar/[slug]` | Alias cidade | ⚠️ | `/cidade/{slug}` | `/comprar/cidade/{slug}` | `/comprar/[slug]` → `/cidade/[slug]` | Depois de redirect |
| `/comprar/cidade/[slug]` | Paralelo cidade | ⚠️ | `/cidade/{slug}` | `/comprar/[slug]` | idem | Depois de redirect |
| `/comprar/estado/[uf]` | Busca por estado | ✓ | `/comprar/estado/{uf}` | — | — | Não |
| `/cidade/[slug]` | Territorial | ✓ | `/cidade/{slug}` | — | — | Nunca |
| `/cidade/[slug]/marca/[brand]` | Territorial | ✓ | idem | — | — | Nunca |
| `/cidade/[slug]/marca/[brand]/modelo/[model]` | Territorial | ✓ | idem | — | — | Nunca |
| `/cidade/[slug]/oportunidades` | Territorial | ✓ | idem | — | — | Nunca |
| `/cidade/[slug]/abaixo-da-fipe` | Territorial | ✓ | idem | — | — | Nunca |
| `/carros-em/[slug]`, `/carros-baratos-em/[slug]`, `/carros-automaticos-em/[slug]` | SEO local | ✓ | idem | hifenizados `/carros-em-{slug}` já têm redirect | manter | Nunca |
| `/veiculo/[slug]` | Detalhe canônico | ✓ | `/veiculo/{slug}` | — | — | Nunca |
| `/anuncios/[identifier]` | Redirect legado | ✗ | — | — | → `/veiculo/{slug}` (já existe) | Depois de confirmação |
| `/painel/anuncios/novo` | Redirect legado | ✗ | — | — | → `/anunciar/novo` (já existe) | **Pode remover** (PR C, após prova) |
| `/anunciar/publicar` | Redundante? | — | — | — | — | Auditar no PR A |
| `/dashboard`, `/dashboard-loja` | Painéis | ✗ | — | — | — | Nunca (Trilha 2 decide unificação) |
| `/admin/*` | Admin | ✗ | — | — | — | Nunca (Trilha 2) |

**Relação crítica entre `/anuncios`, `/comprar/*`, `/cidade/*`, `/carros-em/*`**:

- `/anuncios` = canônica para listagem geral (PROJECT_RULES).
- `/cidade/{slug}` = canônica para territorial (segundo PROJECT_RULES §Rotas territoriais).
- `/comprar/*` = alias operacional que **deve** redirecionar ou coexistir com `rel="canonical"` apontando para a canônica.
- `/carros-em/*`, `/carros-baratos-em/*`, `/carros-automaticos-em/*` = páginas SEO de palavra-chave com conteúdo próprio. Devem ter `canonical="self"` e conteúdo diferenciado para evitar duplicate content.

**Regra**: qualquer mudança de rota em qualquer PR **obriga** atualização desse mapa e teste E2E do redirect.

### 8.2. Snapshot de rotas públicas (pré-mudança)

Antes de executar qualquer PR que altere rota ou conteúdo público, gerar snapshot:

- Lista de URLs públicas indexáveis (extraída de `sitemap.xml`).
- Para cada URL: status HTTP, canonical, `<h1>`, presença de JSON-LD, presença de breadcrumb.
- Formato: JSON em `tests/snapshots/public-routes-YYYYMMDD.json`.
- Gerador: script novo em `scripts/snapshot-public-routes.mjs` (backlog do PR B).

Snapshot é referência para **diff pós-PR**. Qualquer quebra em metadata aparece.

### 8.3. Contrato SEO

**Obrigatório em toda página pública indexável**:

| Item | Regra |
|---|---|
| `generateMetadata` | Presente. Não usar valores hardcoded. |
| `title` | Padrão `"<Conteúdo> \| Carros na Cidade"` via template. |
| `description` | 140-160 caracteres, específico por página. |
| `alternates.canonical` | Obrigatório. Respeita ROUTE_CANONICAL_MAP. |
| `openGraph` | `title`, `description`, `url`, `image` (com fallback). |
| `twitter.card` | `"summary_large_image"` em detalhe; `"summary"` no resto. |
| `robots` | `index, follow` em canônicas; `noindex` em aliases. |
| `<h1>` | Único por página. Conteúdo primário. |
| Breadcrumb | Obrigatório em páginas com profundidade ≥2. JSON-LD `BreadcrumbList`. |
| JSON-LD | `Article` em blog, `Product` em detalhe, `BreadcrumbList` em territorial. |
| Sitemap | Presença em `/sitemap.xml` ou sub-sitemap específico. |
| Redirects 301 | Toda rota removida ou renomeada tem entrada em `middleware.ts`. |
| Cache sitemap | Endurecer de 300s → **900s com stale-while-revalidate=3600**. Logar falhas explicitamente. |

### 8.4. Contrato SSR

**Regra explícita e inviolável**:

> Toda página pública SSR/ISR que busca dados no backend deve usar `ssrResilientFetch` ou wrapper equivalente. É proibido introduzir `fetch` cru para backend em páginas públicas críticas.

**Helpers oficiais**:
- `frontend/lib/net/ssr-resilient-fetch.ts` — wrapper com retry + timeout escalonado + propagação de `X-Cnc-Client-Ip`.

**Cobertura obrigatória** (verificada no PR B):

- [ ] Home usa wrapper
- [ ] `/anuncios` usa wrapper
- [ ] `/comprar/*` usa wrapper
- [ ] `/cidade/**` usa wrapper
- [ ] `/veiculo/[slug]` usa wrapper
- [ ] `/blog/*` usa wrapper (fetch de conteúdo)
- [ ] `/tabela-fipe/*` usa wrapper
- [ ] `/simulador-financiamento/*` usa wrapper
- [ ] `/carros-{em,baratos-em,automaticos-em}/[slug]` usa wrapper

**Proibições**:

- ❌ `fetch(url)` cru em Server Component público.
- ❌ `axios` em Server Component público.
- ❌ Chamar backend direto sem passar pelo BFF se a rota já existe em `/app/api/`.

**Fallback obrigatório**: toda página SSR pública precisa ter um fallback explícito para quando o backend falha — nunca retornar página branca. Referência: `lib/home/public-home.ts` (fallback home).

### 8.5. Contrato de imagens

**Componente único**: `<VehicleImage>` (criar no **PR E**). Obrigatório em todo lugar que renderiza imagem de anúncio.

**Regras**:

| Item | Regra |
|---|---|
| Componente base | `next/image` sempre (exceto SVG puro). |
| `sizes` | Obrigatório em toda instância. Padrão: `"(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`. |
| `priority` | Apenas em imagem acima da dobra (hero, primeiro card do grid). Máximo 1-2 por página. |
| Loading | `lazy` (default). `eager` apenas com `priority`. |
| Placeholder | `blur` com `blurDataURL` gerado no backend ou fallback estático. |
| Fallback de erro | Componente `<VehicleImagePlaceholder>` — nunca broken image. |
| Compatibilidade | `/api/vehicle-images` (upload) e R2 (storage). |
| Domínios | `remotePatterns` restrito: R2, Unsplash (dev), localhost (dev). **Remover `**`**. |
| SVG | Bloqueado (remove `dangerouslyAllowSVG: true` no `next.config.mjs`). |
| CLS | `width` e `height` obrigatórios. |

**Tratamento de erro**:

```
Imagem falha carregar
  → onError handler
  → <VehicleImagePlaceholder /> (sem layout shift)
  → log silencioso via Analytics
```

Nunca deixar layout quebrar porque imagem caiu.

---

## 9. Design System como contrato

Entregue no **PR D** como aditivo — não remove nada existente até PR F+.

### 9.1. Tokens (`tailwind.config.ts` + `globals.css`)

**Cores** (paleta mínima):

| Token | Uso | Valor referencial |
|---|---|---|
| `primary-50..900` | CTAs, links, ativos | Azul (manter marca) |
| `success-500` | Abaixo da FIPE, verificado, WhatsApp | Verde |
| `warning-500` | Alertas, selos "Imperdível" | Laranja |
| `danger-500` | Erros, urgência | Vermelho |
| `neutral-0..900` | Textos, bordas, fundos | Escala cinza |
| `surface-base` | Fundo de card | Branco / dark equivalent |
| `surface-muted` | Trust bar, sections secundárias | Cinza muito claro |
| `border-default` | Bordas de card e input | Cinza claro |
| `text-primary` | Conteúdo principal | neutral-900 |
| `text-secondary` | Labels, meta | neutral-600 |
| `text-muted` | Hints | neutral-400 |

**Raio**:

| Token | Uso |
|---|---|
| `rounded-sm` (4px) | Badges, chips pequenos |
| `rounded-md` (8px) | Cards padrão, inputs |
| `rounded-lg` (12px) | Cards destaque |
| `rounded-2xl` (16px) | Hero, painéis |
| `rounded-full` | Atalhos circulares, avatars |

**Sombra**:

| Token | Uso |
|---|---|
| `shadow-sm` | Cards padrão |
| `shadow-md` | Cards em hover, modals |
| `shadow-lg` | Drawers, bottom sheets |

**Espaçamento** (escala Tailwind):

- 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64

**Breakpoints**:

| Token | px |
|---|---|
| `sm` | 640 |
| `md` | 768 |
| `lg` | 1024 |
| `xl` | 1280 |

**Alturas fixas**:

| Elemento | Valor |
|---|---|
| Input | 48px (mobile), 40px (desktop) |
| Button primário | 48px (mobile), 44px (desktop) |
| Chip/filtro | 36px |
| Bottom navigation | 64px + safe-area |
| Header | 56px (mobile), 72px (desktop) |

### 9.2. Primitivos (lista fechada)

Criados em `components/ui/` como aditivos no PR D. Cada um com tests + Storybook-like doc em `docs/DESIGN_SYSTEM.md`:

| Primitivo | Propósito | Variantes |
|---|---|---|
| `<Button>` | Ação | `primary`, `secondary`, `ghost`, `destructive`, `whatsapp` |
| `<Input>` | Entrada de texto | `default`, `search`, `error` |
| `<Select>` | Seleção de opção | `default`, `native`, `searchable` |
| `<Chip>` | Pílula clicável | `filter`, `removable`, `toggle` |
| `<Badge>` | Selo pequeno | `info`, `success`, `danger`, `premium` |
| `<Card>` | Container genérico | `default`, `elevated`, `flat` |
| `<SectionHeader>` | Título + "ver todos" | `default`, `with-icon` |
| `<BottomNav>` | Navegação inferior mobile | `default`, `with-fab` |
| `<SearchBar>` | Campo de busca + filtros | `default`, `sticky` |
| `<FilterChip>` | Filtro aplicado | `active`, `removable` |
| `<ActionShortcut>` | Atalho circular "stories-like" | `default`, `highlight` |
| `<VehicleImage>` | Imagem de anúncio | `card`, `gallery`, `thumb` |
| `<AdCard>` | Card de anúncio canônico | 8 variantes (§10) |
| `<ArticleCard>` | Card de blog | `default`, `featured` |
| `<TrustStrip>` | Faixa de confiança | `compact`, `full` |

### 9.3. Regras arquiteturais

1. **Não criar novo card paralelo**. Se precisa de algo novo, é **variante de `<AdCard>`** ou adapter para ele.
2. **Não criar botão local se `<Button>` atende**. Props primeiro, componente novo depois.
3. **Páginas públicas são server-first**. `"use client"` apenas quando há interação real (filtro dinâmico, modal, form com estado).
4. **Um componente, um arquivo, um propósito**. Variantes são props, não arquivos.
5. **Props consistentes**: `size`, `variant`, `className` sempre com tipagem estrita.
6. **Nunca estilizar com CSS inline** em componentes de sistema. Apenas Tailwind.

---

## 10. Contrato do `<AdCard>` (8 variantes)

Card oficial de anúncio. Entregue no **PR F**. Todas as variantes renderizadas a partir do **mesmo componente** com prop `variant`.

### Interface

```
<AdCard
  item={BaseAdData}
  variant="compact" | "featured" | "grid" | "carousel" |
          "horizontal" | "related" | "dashboard" | "admin"
  onFavorite?={(adId) => void}
  href?={string}
/>
```

### Matriz de variantes

| Variante | Uso | Img ratio | Campos principais | Mobile | Desktop | Fallback img | Favorito | Km | Preço | Localização | CTA |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **compact** | Resultados pequenos, sidebar | 4:3 | Marca, modelo, ano, km, preço | 1 col | 2-3 col | placeholder | ✓ inline | badge na foto | pequeno | inline abaixo | clique em tudo |
| **featured** | Hero, destaques | 16:9 | Tudo + badge "Destaque" | Full-width | 1 col principal | placeholder + badge erro | ✓ topo direito | badge na foto | grande azul | pin + cidade | "Ver oferta" |
| **grid** | Listagem catálogo | 4:3 | Marca, modelo, ano, versão, km, preço, localização, badge FIPE | 1-2 col | 3-4 col | placeholder | ✓ topo direito | badge na foto | médio azul | inline | clique em tudo |
| **carousel** | Home carrosséis | 4:3 | Marca, modelo, ano, km, preço, localização | scroll horizontal | scroll horizontal | placeholder | ✓ topo direito | badge na foto | médio azul | inline | clique em tudo |
| **horizontal** | "Similares" em detalhe | 1:1 (thumb lateral) | Marca, modelo, ano, preço | Full-width | 2 col | placeholder | — | inline | médio | inline | clique em tudo |
| **related** | Após artigo de blog | 4:3 | Marca, modelo, ano, preço, cidade | 1-2 col | 2-3 col | placeholder | — | — | médio | inline | clique em tudo |
| **dashboard** | Painel "meus anúncios" | 4:3 | Foto, modelo, ano, km, preço, **status** (ativo/pausado), métricas (views/contatos) | 1 col | 2 col | placeholder | — | inline | médio | inline | ação do painel (editar, pausar) |
| **admin** | Admin moderation | 4:3 | Foto, modelo, ano, **status admin**, **flags**, vendedor | 1 col | tabela | placeholder | — | — | médio | inline | ações de moderação |

### Regras comuns

- **Imagem**: sempre via `<VehicleImage variant={...}>`. Nunca `<img>` cru.
- **Preço**: sempre em `text-primary-600 font-bold`. Badge "Abaixo da FIPE" verde ao lado quando aplicável.
- **Badge de km**: sobreposto na foto, canto inferior esquerdo.
- **Favorito**: ícone coração canto superior direito. Animação sutil ao toggle.
- **Link**: prop `href` obrigatória, aponta para `/veiculo/[slug]` (rota canônica).
- **Sem Client Component** a menos que tenha interação (favorito com feedback, hover desktop). Padrão é Server.

### Proibido

- Reimplementar renderização de card fora deste componente.
- Criar `HomeVehicleCard` paralelo.
- Criar `DashboardAdCard` separado.
- Mudar estilo de preço ou posição de favorito por página.

---

## 11. Regra de Bottom Navigation

Componente: `<BottomNav>` (§9.2). Comportamento fixo:

### Aparece em

| Página | Por quê |
|---|---|
| Home (`/`) | Navegação principal |
| Comprar estadual (`/anuncios`) | Navegação principal |
| Comprar por cidade (`/cidade/**`) | Navegação principal |
| Tabela FIPE | Isca digital com navegação |
| Simulador | Isca digital com navegação |
| Blog (lista e artigos) | Conteúdo permanente |
| Favoritos | Navegação principal |
| Painel público / usuário | Acesso rápido a seções |

### Substituído por CTA fixo em

| Página | CTA |
|---|---|
| Detalhe do veículo (`/veiculo/[slug]`) | `<StickyCTA>`: preço à esquerda, botão verde WhatsApp à direita. Exemplo: `R$ 109.900 \| 💬 Chamar no WhatsApp` |

Motivo: detalhe é página de conversão. A única ação que importa é contatar vendedor.

### NÃO aparece em

| Página | Por quê |
|---|---|
| `/login` | Fluxo focado, sem distração |
| `/cadastro` | Idem |
| `/recuperar-senha` | Idem |
| Checkout/pagamento crítico (quando existir) | Fluxo focado |
| `/admin/*` | Área privada com navegação própria |

### Caso especial — publicação (`/anunciar/novo`)

**Avaliar por passo**. Se bottom nav aparecer, **não pode competir** com:
- Barra de progresso (topo, sticky).
- Botões "Voltar" / "Continuar" (footer sticky do wizard).

**Regra**: durante passos do wizard, bottom nav é ocultada. Reaparece no step final "Sucesso" para levar de volta ao painel/home.

---

## 12. Contrato de performance mobile (metas como obrigações)

Metas **obrigatórias** para merge de qualquer PR visual (D–N):

| Métrica | Meta | Medição |
|---|---|---|
| LCP mobile | **< 2.5s** | Lighthouse mobile, página real em staging |
| CLS mobile | **< 0.1** | Lighthouse mobile |
| TBT mobile | **< 200ms** | Lighthouse mobile |
| Lighthouse Performance (mobile) | **> 80** | Lighthouse CI opcional |
| Lighthouse SEO | **> 95** | Lighthouse CI |
| Lighthouse Accessibility | **> 90** | Lighthouse CI |
| Bundle JS crítico | **< 200 KB** (gzip) | `next build --profile` |

### Práticas obrigatórias

- **`priority`** apenas em imagens acima da dobra. Máximo 1-2 por página.
- **`loading="lazy"`** em todas as outras imagens (default do next/image).
- **`dynamic()`** para componentes pesados (carrossel, mapa, modal pesado, gráficos admin).
- **Nunca `"use client"`** numa página pública inteira. Apenas em componentes específicos com interação.
- **Fontes**: apenas `next/font/google` com `display: "swap"`. Preload apenas da fonte principal.
- **Third-party scripts**: bloqueados sem consentimento LGPD (Trilha 2).
- **Tailwind purge**: garantir que `content` em `tailwind.config.ts` cobre `app/`, `components/`, `lib/`.
- **Imagens**: Cloudflare R2 via `next/image` com `sizes` correto.

### Bloqueio de merge

PR que degrada **qualquer uma** dessas métricas vs baseline não passa. Snapshot de baseline coletado no **PR A**.

---

## 13. Critérios endurecidos para deletar código morto

**Nenhum arquivo é deletado só porque `grep` de import não achou nada.** Deletar só após checklist completo.

### 7 checks obrigatórios antes de remover qualquer arquivo

| # | Check | Comando |
|---|---|---|
| 1 | Busca pelo nome do arquivo | `grep -r "nomeArquivo" frontend/` (sem extensão) |
| 2 | Busca pelo nome do componente/export | `grep -r "NomeComponente" frontend/` |
| 3 | Busca por exports indiretos (barrel `index.ts`) | Inspecionar `components/*/index.ts`, `lib/*/index.ts` |
| 4 | Busca por import dinâmico | `grep -rE "import\(.*nomeArquivo.*\)" frontend/` |
| 5 | Verificação em re-exports | `grep -r "export.*from.*nomeArquivo" frontend/` |
| 6 | Build passa sem o arquivo | `npm run build` (rodar com arquivo removido em branch de teste) |
| 7 | Typecheck + e2e:smoke passam | `npm run typecheck && npm run test:e2e:smoke` |

### Classificação dos 13 órfãos candidatos (§3.4)

| Candidato | Status até prova |
|---|---|
| `ads/AdDetailsPage.tsx` | **Suspeito, manter por enquanto** — nome sugere página inteira, pode ter referências indiretas |
| `ads/AdListingCard.tsx` | Suspeito — verificar se é legado com adapter ativo |
| `common/CTASection.tsx` | Suspeito — genérico, pode ser usado em landing futura |
| `common/FAQSection.tsx` | Suspeito — idem |
| `common/FinancingSimulator.tsx` | Suspeito — simulador tem rota própria, confirmar |
| `common/RegionalEntryHub.tsx` | Suspeito |
| `common/StatsSection.tsx` | Suspeito |
| `buy/BuyPageShell.tsx` | Órfão provável — verificar se `BuyMarketplacePageClient` não importa indireto |
| `buy/VehicleBadge.tsx` | Suspeito |
| `fipe/FipeVehicleCarousel.tsx` | Suspeito |
| `modal/ExitIntentModal.tsx` | **Manter por enquanto** — pode ser MVP abandonado útil |
| `painel/new-ad-wizard/WizardSteps.tsx` | **Legado com adapter — não remover ainda** — wizard de publicação é fluxo crítico |
| `admin/Admin{ActionDialog,EmptyState,ErrorState,LoadingState}.tsx` | Suspeitos — admin é Trilha 2, **não tocar em PRs A–O** |
| `layout/TerritorialHeaderLinks.tsx` | Órfão provável — verificar junto com remoção de `layout/` |
| `components/Header.tsx` | **Órfão confirmado** (54 bytes re-export) — candidato #1 a deletar no PR C |
| `components/layout/Header.tsx` | Suspeito — confirmar no PR C antes de remover |

**Regra final**: nenhum arquivo classificado como "suspeito" ou "legado" é removido no PR C. Só "órfãos confirmados" pelos 7 checks.

---

## 14. Plano de PRs reorganizado (A–O)

### Princípios

- Cada PR **deploycável e reversível independentemente**.
- PR A (contratos) é **pré-requisito** para todos os visuais (D em diante).
- PR B (testes de proteção) é **pré-requisito** para PR C (remoção de órfãos).
- Cada PR tem critério de aceitação claro em §16.
- **Trilha 1 e Trilha 2 não compartilham PRs**.

### Trilha 1 — Redesign público

#### PR A — Contratos de estabilidade 📜

**Objetivo**: entregar 5 contratos + 1 mapa, sem mudança funcional.

**Entregáveis**:
- `docs/ROUTE_CANONICAL_MAP.md` completo (§8.1)
- `docs/DESIGN_SYSTEM.md` (skeleton com §9)
- Baseline de métricas (Lighthouse mobile em 10 páginas-chave) gravado em `docs/baseline-metrics-YYYYMMDD.md`
- Lista de páginas intocáveis revisada e confirmada
- Script `scripts/snapshot-public-routes.mjs` (opcional, pode ir em PR B)

**Pré-requisito**: nenhum
**Bloqueia**: todos os PRs visuais (D–N)
**Risco**: nulo — só documentação
**Teste**: nenhum (doc)

#### PR B — Testes de proteção 🛡️

**Objetivo**: adicionar cobertura que detecta regressão antes dela acontecer.

**Entregáveis**:
- Teste: `sitemap.xml` gera todas as 9 seções sem erro
- Teste: canonical URL presente em 10 páginas públicas (lista fixa)
- Teste: JSON-LD + breadcrumb preservados em `/veiculo/[slug]`, `/cidade/**`, blog
- Teste: grep de CI que falha se `fetch` cru aparecer em Server Component público (guardrail)
- Teste: fluxo de detalhe do veículo — conversão via WhatsApp
- Teste: isolamento de usuário permanece intacto (reforço de `user-isolation-api.spec.ts`)
- Script de snapshot de rotas públicas

**Pré-requisito**: PR A
**Bloqueia**: PR C (remoção de órfãos) e PRs visuais
**Risco**: baixo (aditivo)
**Teste**: rodar todos os novos testes passando

#### PR C — Shell e órfãos comprovados 🧹

**Objetivo**: remover **apenas** o que passou pelo checklist §13.

**Entregáveis**:
- Deletar `components/Header.tsx` (órfão confirmado)
- Deletar `components/layout/` inteira **somente se** checklist §13 confirmar
- Deletar `/painel/anuncios/novo` (redirect puro coberto por middleware)
- NÃO tocar em "suspeitos" ou "legados"

**Pré-requisito**: PR B passando
**Bloqueia**: nenhum (opcional)
**Risco**: baixo (após checklist)
**Teste**: `npm run build && npm run typecheck && npm run test:e2e:smoke`

#### PR D — Design system aditivo 🎨

**Objetivo**: introduzir tokens e primitivos **sem remover** nada existente.

**Entregáveis**:
- `tailwind.config.ts` com tokens de §9.1
- Primitivos de §9.2 em `components/ui/` (exceto `<VehicleImage>` e `<AdCard>` que têm PRs próprios)
- `docs/DESIGN_SYSTEM.md` com exemplos de uso de cada primitivo

**Pré-requisito**: PR A
**Bloqueia**: PR E, PR F, e todos PRs visuais
**Risco**: baixo (aditivo)
**Teste**: build passa, Storybook-like doc renderiza

#### PR E — Componente único de imagem 🖼️

**Objetivo**: `<VehicleImage>` oficial e `<VehicleImagePlaceholder>`.

**Entregáveis**:
- `components/ui/VehicleImage.tsx` conforme §8.5
- Placeholder/skeleton + fallback de erro
- Restringir `remotePatterns` em `next.config.mjs` (remover `**`)
- Remover `dangerouslyAllowSVG: true`

**Pré-requisito**: PR D
**Bloqueia**: PR F
**Risco**: médio (mexe em `next.config.mjs`)
**Teste**: visual em dev + CLS medido em 5 páginas

#### PR F — `<AdCard>` unificado com variantes 🃏

**Objetivo**: consolidar todos os cards de anúncio em `<AdCard>` com 8 variantes (§10).

**Entregáveis**:
- `components/ads/AdCard.tsx` refatorado com prop `variant`
- `HomeVehicleCard` vira adapter → `<AdCard variant="carousel">` ou `variant="featured">`
- `CatalogVehicleCard` vira adapter → `<AdCard variant="grid">`
- `sections/VehicleCard` **deletado** (após checklist §13)
- `CarCard` e `common/VehicleCard` permanecem como adapters legados (manter)

**Pré-requisito**: PR E
**Bloqueia**: PR G, H, I, J (toda página que lista anúncio)
**Risco**: alto — componente mais reusado do sistema
**Teste**: visual em home, catálogo, cidade, detalhe (similares), favoritos, painel

#### PR G — Nova home 🏠

**Objetivo**: home mobile-first conforme mockup aprovado.

**Entregáveis**:
- Header com localização clicável (`<PublicHeader>` refinado — não duplicar)
- `<SearchBar>` protagonista + `<Button>` de filtros
- `<FilterChip>` rápidos ("Até R$ 50k", "SUV", etc.)
- `<ActionShortcut>` circulares úteis (Comprar, Vender, Blog, Ofertas, Lojas, Favoritos)
- Hero regional com foto da cidade do usuário (fallback genérico com nome sobreposto)
- `<AdCard variant="carousel">` em "Destaques em [cidade]"
- Seção Blog com `<ArticleCard>`
- `<BottomNav>` fixo (§11)
- `<TrustStrip>`

**Pré-requisito**: PRs D, E, F
**Bloqueia**: nenhum (mas é marco do MVP)
**Risco**: alto — página #1 do funil
**Teste**: `main-flow.spec.ts`, Lighthouse mobile > 80, visual em 3 dispositivos

#### PR H — Comprar por cidade 🌆

**Objetivo**: `/cidade/[slug]` e sub-rotas com novo padrão, **sem mudar URLs**.

**Entregáveis**:
- Chips de filtro ativos
- `<AdCard variant="grid">`
- `<FilterDrawer>` (bottom sheet) com filtros avançados
- Manter JSON-LD territorial (não remover!)
- Breadcrumb mantido

**Pré-requisito**: PR G
**Bloqueia**: PR J
**Risco**: alto (SEO massivo, 500+ páginas afetadas)
**Teste**: canonical preservado, sitemap intacto, E2E territorial

#### PR I — Detalhe do veículo 🚗

**Objetivo**: `/veiculo/[slug]` com novo padrão mobile-first + conversão.

**Entregáveis**:
- **Antes**: extrair AI logic de `page.tsx` (456 linhas) para `lib/vehicle/ai/` (refactor isolado)
- `<PhotoGallery>` mobile-first (swipeable, lightbox)
- `<StickyPrice>` no scroll
- `<StickyCTA>` com preço + botão WhatsApp (substitui bottom nav, §11)
- `<SpecSheet>` expansível
- Opcionais em `<Chip>` toggle
- `<SellerCard>` com reputação
- `<SimilarCars>` usando `<AdCard variant="horizontal">`
- Preservar JSON-LD `Product`, breadcrumb

**Pré-requisito**: PR F
**Bloqueia**: nenhum
**Risco**: altíssimo — página de conversão #1
**Teste**: `vehicle-detail-premium.spec.ts`, fluxo completo de contato WhatsApp, CLS < 0.1

#### PR J — Comprar estadual / catálogo 🗺️

**Objetivo**: unificar `/comprar/*` e `/anuncios` conforme ROUTE_CANONICAL_MAP.

**Entregáveis**:
- Decidir canônica definitiva (PROJECT_RULES diz `/anuncios`)
- Adicionar redirects 301 no `middleware.ts` para aliases
- Nova listagem mobile-first (reuso de PR H)

**Pré-requisito**: PR H (padrão validado), PR A (ROUTE_CANONICAL_MAP)
**Bloqueia**: nenhum
**Risco**: alto — impacto SEO de redirects
**Teste**: E2E de todos os redirects 301, canonical validado em 20 URLs

#### PR K — FIPE e simulador 💰

**Objetivo**: iscas digitais redesenhadas.

**Entregáveis**:
- Interface simplificada (3 dropdowns + resultado)
- `<AdCard variant="carousel">` com "carros deste modelo em [cidade]"
- Integração com territorial (link para busca filtrada)
- Manter JSON-LD `WebApplication`

**Pré-requisito**: PR F
**Bloqueia**: nenhum
**Risco**: baixo
**Teste**: fluxo FIPE → busca funciona

#### PR L — Blog 📰

**Objetivo**: blog como motor de aquisição orgânica.

**Entregáveis**:
- Lista com hero editorial + categorias em `<Chip>`
- `<ArticleCard>` grid
- Artigo individual: reading progress, inline CTAs (`<AdCard>` contextual), artigos relacionados
- Schema.org `Article` + `BreadcrumbList`
- URLs limpas já existem — **não mexer**

**Pré-requisito**: PRs D, F
**Bloqueia**: nenhum
**Risco**: baixo
**Teste**: sitemap blog intacto, JSON-LD presente

#### PR M — Publicação de anúncio 📝

**Objetivo**: `/anunciar/novo` wizard moderno.

**Entregáveis**:
- Multi-step com progress bar fixa
- Cada passo em 1 tela sem scroll vertical excessivo
- `<PhotoUploader>` com reorder
- `<FipePriceIndicator>` dinâmico
- Preview antes de publicar
- Auto-save de rascunho
- BottomNav regra especial (§11 caso especial)

**Pré-requisito**: PR F (preview usa `<AdCard>`)
**Bloqueia**: nenhum
**Risco**: alto — monetização
**Teste**: `10-login-ad-publish.spec.ts`, `publish-full-surface.spec.ts`, `register-minimal-to-publish.spec.ts`

#### PR N — Painel (visual) 👤

**Objetivo**: dashboard PF + lojista com novo design.

**Entregáveis**:
- `<AdCard variant="dashboard">` com status + métricas
- Navegação unificada (decisão de unificar rotas fica na Trilha 2)
- `<BottomNav>` ou sidebar adaptativa

**Pré-requisito**: PR F
**Bloqueia**: nenhum
**Risco**: médio
**Teste**: `dashboard-login-pf-pj.spec.ts`

### Trilha 2 — Segurança, auth, admin

#### PR O — Auth/Admin em trilha separada 🔐

**Objetivo**: login/cadastro com padrão visual novo **+ backlog de segurança**.

**Entregáveis visuais**:
- `/login`, `/cadastro`, `/recuperar-senha` redesenhados (minimalista premium)
- Social login (se aplicável)

**Backlog de segurança** (PRs subsequentes sem bloqueio):
- `/favoritos`: migrar de client para server com Suspense
- `useAdminGuard()` → middleware server
- Dashboard PF/PJ: avaliar unificação de rotas
- Banner LGPD + consentimento
- Cookies review
- Isolamento de dados no BFF (code review completo)

**Pré-requisito**: PR D (primitivos)
**Bloqueia**: nenhum
**Risco**: médio (visual) / alto (segurança)
**Teste**: E2E auth, `user-isolation-api.spec.ts`

---

## 15. Migração `services/` → `lib/` (refactor estrutural)

**NÃO É LIMPEZA**. Cada sub-PR é independente e pode rodar entre PRs visuais.

### PR 0.4A — Inventário e contrato de importação

**Objetivo**: zero mudança funcional. Produz documento de mapeamento.

**Entregáveis**:
- `docs/SERVICES_MIGRATION_MAP.md` com:
  - Tabela de todos os arquivos em `frontend/services/`
  - Tabela de equivalentes em `frontend/lib/`
  - Mapa de quem importa cada serviço
  - Destino canônico de cada domínio
  - Regra oficial: novas integrações **devem** viver em `lib/`, não em `services/`
- Atualizar `PROJECT_RULES.md` com regra explícita.

**Risco**: nulo
**Teste**: build passa

### PR 0.4B — Migrar serviços de baixo risco

**Domínios**: `market`, `plans` (criar `lib/market/`, `lib/plans/`)

**Critério de baixo risco**: não afeta login, sessão, publicação, detalhe do anúncio.

**Risco**: baixo
**Teste**: `npm run test`, build passa, páginas que usam market/plans funcionam

### PR 0.4C — Migrar `ads` e `vehicle`

**Domínios**: `ads` → `lib/ads/`, `vehicle` → `lib/vehicle/`

**Pré-requisito**: testes cobrindo:
- Home
- Catálogo
- Comprar por cidade
- Detalhe do veículo
- Publicação de anúncio

**Risco**: alto
**Teste**: E2E completo (todas as 11 specs)

### PR 0.4D — Migrar `auth` e `session`

**Domínios**: `auth` → `lib/auth/`, `session` → `lib/session/`

**Pré-requisito**: testes específicos de:
- Login
- Cadastro
- Cookies (httpOnly, secure, sameSite)
- Sessão (refresh token)
- Favoritos
- Dashboard
- Publicação
- Isolamento entre usuários (`user-isolation-api.spec.ts`)

**Risco**: altíssimo
**Teste**: E2E completo + manual em staging

---

## 16. Checklist de validação por PR

Cada PR deve responder SIM a todas as perguntas aplicáveis antes do merge.

### Universal (todo PR)

- [ ] `npm run build` passa
- [ ] `npm run lint` passa (max-warnings 0)
- [ ] `npm run typecheck` passa
- [ ] `npm run test` passa
- [ ] `npm run test:e2e:smoke` passa
- [ ] Teste manual em mobile real (ou DevTools mobile)

### SEO (PRs que afetam página pública)

- [ ] Toda nova página SSR usa `ssrResilientFetch`
- [ ] `generateMetadata` presente
- [ ] `alternates.canonical` correto conforme ROUTE_CANONICAL_MAP
- [ ] `<h1>` único por página
- [ ] Breadcrumb/JSON-LD mantidos
- [ ] Nenhuma URL indexada removida sem 301 no `middleware.ts`
- [ ] `sitemap.xml` ainda gera sem erros
- [ ] OG image + Twitter card presentes

### Performance (PRs visuais)

- [ ] Lighthouse Performance mobile > 80
- [ ] LCP < 2.5s, CLS < 0.1, TBT < 200ms
- [ ] `<VehicleImage>` usado (nunca `<img>` cru)
- [ ] `priority` só acima da dobra
- [ ] Componentes pesados com `dynamic()` quando aplicável
- [ ] Nenhum `"use client"` em página pública inteira

### Segurança (PRs que tocam auth/painel/admin)

- [ ] Nenhuma API key hardcoded
- [ ] BFF valida sessão em toda rota autenticada
- [ ] Cookies mantêm `httpOnly`, `secure` em prod, `sameSite`
- [ ] Nenhum `dangerouslySetInnerHTML` sem sanitização
- [ ] `user-isolation-api.spec.ts` passa

### Arquitetura

- [ ] Shell oficial (`PublicHeader`/`PublicFooter`) — nenhum Header/Footer local
- [ ] Card oficial (`<AdCard>`) — sem novo card paralelo
- [ ] Imagem oficial (`<VehicleImage>`) — sem `<img>` cru
- [ ] Nova integração em `lib/`, nunca em `services/`
- [ ] Sem componente client quando server basta
- [ ] Nenhum arquivo removido sem passar pelos 7 checks §13

### BottomNav (§11)

- [ ] Aparece nas páginas permitidas (home, catálogo, cidade, FIPE, sim, blog, favoritos, painel)
- [ ] Substituído por `<StickyCTA>` em `/veiculo/[slug]`
- [ ] Oculto em login/cadastro/recuperação
- [ ] Não compete com wizard no fluxo de publicação

---

## 17. Métricas de acompanhamento

Coletadas antes e depois de cada PR visual.

| Métrica | Alvo | Ferramenta |
|---|---|---|
| LCP mobile | < 2.5s | Lighthouse mobile |
| CLS mobile | < 0.1 | Lighthouse mobile |
| TBT mobile | < 200ms | Lighthouse mobile |
| Lighthouse Performance | > 80 | Lighthouse mobile |
| Lighthouse SEO | > 95 | Lighthouse |
| Lighthouse A11y | > 90 | Lighthouse |
| Bundle JS crítico (gzip) | < 200 KB | `next build --profile` |
| Páginas indexadas | manter ou crescer | Google Search Console |
| 429 rate limit (7d) | 0 | Render logs |
| Tempo médio SSR | < 2s | BFF logs |
| Taxa de 5xx SSR | < 0.5% | BFF logs |

Baseline coletado no **PR A**. Cada PR subsequente compara contra baseline.

---

## 18. Estimativa em 3 camadas

Faixas, não pontos. Refletem incerteza real.

### Camada 1 — MVP visual seguro: **15-25 dias**

**Escopo**: PRs A → G

| PR | Dias |
|---|---|
| PR A — Contratos | 2-3 |
| PR B — Testes de proteção | 3-4 |
| PR C — Shell e órfãos | 1-2 |
| PR D — Design system aditivo | 3-4 |
| PR E — `<VehicleImage>` | 1-2 |
| PR F — `<AdCard>` unificado | 2-3 |
| PR G — Nova home | 3-5 |
| Buffer | 2-3 |

**Entrega**: home nova sobre fundação limpa, sem mexer em conversão nem SEO territorial massivo. Já dá para compartilhar e medir impacto.

### Camada 2 — Reconstrução pública principal: **30-45 dias**

**Escopo**: PRs A → M (tudo público redesenhado exceto painel visual e auth/admin)

| PR adicional | Dias |
|---|---|
| PR H — Comprar por cidade | 3-4 |
| PR I — Detalhe do veículo | 4-5 |
| PR J — Comprar estadual | 2-3 |
| PR K — FIPE e simulador | 2-3 |
| PR L — Blog | 2-3 |
| PR M — Publicação | 4-5 |
| Buffer | 3-5 |

**Entrega**: portal público inteiro redesenhado. Conversão e SEO massivo no novo padrão.

### Camada 3 — Reconstrução completa: **45-60 dias**

**Escopo**: PRs A → O + migração `services/`

| PR adicional | Dias |
|---|---|
| PR N — Painel visual | 4-5 |
| PR O — Auth + backlog Trilha 2 | 5-8 |
| PRs 0.4A–D — Migração services | 5-8 (paralelo com visual) |
| Buffer | 3-5 |

**Entrega**: portal completo, trilha 2 endereçada, arquitetura consolidada.

---

## 19. O que pode começar agora vs o que está bloqueado

### ✅ Desbloqueado AGORA

| Item | Por quê |
|---|---|
| **PR A — Contratos de estabilidade** | Nenhuma dependência. Entrega documentação pura. Ganha confiança. |
| **PR 0.4A — Inventário de services/** | Independente da Trilha 1. Só produz mapa. Zero risco. |
| **Finalizar identidade visual** (paleta, tipografia, logo) | Paralelo ao PR A. Feito pelo usuário (não é código). |

### 🟡 Desbloqueado condicionalmente

| Item | Condição |
|---|---|
| **PR B — Testes de proteção** | Após PR A mergeado |
| **PR C — Órfãos** | Após PR B passando |
| **PR 0.4B** (market, plans) | Após PR 0.4A documentado |

### 🔴 Bloqueado até contratos

| Item | Bloqueio |
|---|---|
| PRs D – N (visuais) | Precisam PR A mergeado |
| PR F (AdCard) | Precisa PRs D + E |
| PR I (detalhe) | Precisa PR F + extração de AI de `/veiculo/[slug]/page.tsx` |
| PR J (comprar estadual) | Precisa ROUTE_CANONICAL_MAP finalizado |
| PR 0.4C (ads, vehicle) | Precisa testes de home, catálogo, cidade, detalhe, publicação |
| PR 0.4D (auth, session) | Precisa testes específicos de auth/cookie/isolamento |

### 🔵 Trilha 2 — data livre

| Item | Observação |
|---|---|
| `useAdminGuard()` → middleware | Não bloqueia Trilha 1 |
| `/favoritos` → server | Não bloqueia Trilha 1 |
| Banner LGPD | Necessário antes de adicionar tracking |
| Unificação dashboard PF/lojista | Decisão arquitetural, não visual |

---

## 20. Apêndice A — Arquivos-chave

| Propósito | Arquivo |
|---|---|
| Regras de projeto | [PROJECT_RULES.md](../PROJECT_RULES.md) |
| Contexto de IA | [AI_CONTEXT.md](../AI_CONTEXT.md) |
| Shell oficial | `frontend/components/shell/PublicHeader.tsx`, `PublicFooter.tsx` |
| Layout raiz | `frontend/app/layout.tsx` |
| Card canônico | `frontend/components/ads/AdCard.tsx` |
| SSR resiliente | `frontend/lib/net/ssr-resilient-fetch.ts` |
| Middleware | `frontend/middleware.ts` |
| Next config | `frontend/next.config.mjs` |
| Tailwind config | `frontend/tailwind.config.ts` |
| Globals CSS | `frontend/app/globals.css` |
| Sitemap index | `frontend/app/sitemap.xml/route.ts` |
| Referência arquitetural | `frontend/components/search/TerritorialResultsPageClient.tsx` |

---

## Apêndice B — Documentos a serem criados

| Documento | Onde | Quando |
|---|---|---|
| `ROUTE_CANONICAL_MAP.md` | `docs/` | PR A |
| `DESIGN_SYSTEM.md` | `docs/` | PR A (skeleton) + PR D (detalhado) |
| `SERVICES_MIGRATION_MAP.md` | `docs/` | PR 0.4A |
| `baseline-metrics-YYYYMMDD.md` | `docs/` | PR A |
| `public-routes-YYYYMMDD.json` | `tests/snapshots/` | PR B |

---

**Fim do diagnóstico endurecido. Pronto para aprovação item-a-item antes da execução.**
