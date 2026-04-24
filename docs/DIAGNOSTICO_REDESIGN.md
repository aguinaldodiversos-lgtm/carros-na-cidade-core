# DIAGNÓSTICO — Redesign Mobile-First do Portal Carros na Cidade

**Data**: 2026-04-24
**Branch**: `claude/sad-elbakyan-8155e1`
**Etapa**: 1 — Diagnóstico (sem edição de código)
**Escopo**: Frontend Next.js 14 App Router

---

## 0. Sumário executivo

O portal tem **arquitetura madura, mas acúmulo relevante de dívida técnica** de gerações anteriores de IA. O frontend é utilizável, indexado e funcional, com **5.500+ páginas planejadas** e estratégia SEO agressiva. Porém, há:

- **Duplicações críticas**: shell em 3 níveis, 5 variações de card de anúncio, 2 dashboards paralelos (PF/lojista), arquitetura `lib/*` vs `services/*` concorrentes.
- **Camada SSR frágil** com histórico recente de incidentes (4 commits de fix em cold start, rate limit 429, propagação de IP).
- **Alta criticidade SEO**: sitemap dinâmico alimenta milhares de URLs; qualquer quebra de canonical/breadcrumb tem impacto massivo.
- **~13 componentes órfãos** (código morto) e **9 serviços duplicados** entre `lib/` e `services/`.
- **Home com `"use client"` inadequado em `/favoritos`**, admin 100% client-side (anti-padrão de segurança e SEO).

**Veredito**: **redesign é viável e recomendado**, mas precisa ser precedido por uma **fase de consolidação** (limpeza de duplicações e órfãos). Sem isso, o redesign vai crescer em cima de fundação duplicada, piorando a situação. Proposta: **9 PRs sequenciais**, cada um independentemente deployável e reversível.

---

## 1. Stack oficial

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

**Observação**: Stack é adequada. Não precisa mexer. Nenhuma atualização de framework é necessária para o redesign.

---

## 2. Inventário de rotas (`app/`)

### 2.1. Páginas públicas indexáveis (SEO-críticas)

| Rota | Renderização | Metadata | Linhas | Status |
|---|---|---|---|---|
| `/` | ISR 300s | ✓ | 50 | ✓ OK |
| `/anuncios` | ISR 60s | ✓ | 87 | ✓ **Canônica** |
| `/veiculo/[slug]` | ISR 1800s | ✓ | **456** | ⚠️ **Gigante, refatorar** |
| `/cidade/[slug]` | Server (no-cache) | ✓ | 32 | ✓ OK |
| `/cidade/[slug]/marca/[brand]` | Server | ✓ | ~40 | ✓ OK |
| `/cidade/[slug]/marca/[brand]/modelo/[model]` | Server | ✓ | ~40 | ✓ OK |
| `/cidade/[slug]/oportunidades` | Server | ✓ | 42 | ✓ OK |
| `/cidade/[slug]/abaixo-da-fipe` | Server | ✓ | ~40 | ✓ OK |
| `/comprar/[slug]` | ISR 60s | ✓ | ~80 | ⚠️ Alias duplicado |
| `/comprar/cidade/[slug]` | ISR 60s | ✓ | 292 | ⚠️ Paralelo |
| `/comprar/estado/[uf]` | ISR 60s | ✓ | 188 | ⚠️ Paralelo |
| `/carros-em/[slug]` | ISR LOCAL_SEO | ✓ | 8 (factory) | ✓ OK |
| `/carros-baratos-em/[slug]` | ISR LOCAL_SEO | ✓ | 8 | ✓ OK |
| `/carros-automaticos-em/[slug]` | ISR LOCAL_SEO | ✓ | 8 | ✓ OK |
| `/blog` | Server | ✓ | ~30 | ✓ OK |
| `/blog/[cidade]` | ISR 300s | ✓ | 128 | ✓ OK |
| `/tabela-fipe` + `/tabela-fipe/[cidade]` | Server + ISR 300s | ✓ | 102 | ✓ OK |
| `/simulador-financiamento` + `[cidade]` | Server + ISR 300s | ✓ | 151 | ✓ OK |
| `/planos` | ISR 900s | ✓ | 109 | ✓ OK |

### 2.2. Páginas institucionais

Todas com `generateMetadata`, Server Components, estrutura consistente:
`/como-funciona`, `/sobre`, `/contato`, `/ajuda`, `/seguranca`, `/politica-de-privacidade`, `/termos-de-uso`, `/lgpd` (~55-70 linhas cada).

### 2.3. Páginas de autenticação

| Rota | Issue |
|---|---|
| `/login` (63 linhas) | ✓ Server, com metadata |
| `/cadastro` | ✓ Server |
| `/recuperar-senha` | ✓ Server |
| `/favoritos` | 🚨 **`"use client"` no topo — única página pública client-only. Perde SEO.** |

### 2.4. Fluxo de anúncio (3 rotas para mesma função)

| Rota | Status |
|---|---|
| `/anunciar` | Landing |
| `/anunciar/novo` | Wizard oficial (force-dynamic) |
| `/anunciar/publicar` | ⚠️ Redundante? Verificar |
| `/painel/anuncios/novo` | 🚨 **Redirect puro para `/anunciar/novo` — remover** |

### 2.5. Dashboards (2 arquiteturas paralelas)

| Rota PF | Rota Lojista |
|---|---|
| `/dashboard` | `/dashboard-loja` |
| `/dashboard/conta` | `/dashboard-loja/plano` |
| `/dashboard/meus-anuncios` | `/dashboard-loja/meus-anuncios` |
| `/dashboard/senha` | `/dashboard-loja/mensagens` |

Ambos usam `AccountPanelShell` com `variant="pf"` vs `variant="lojista"`. **Estrutura duplicada** — poderia ser unificada.

### 2.6. Admin (client-only, anti-padrão)

8 páginas em `/admin/*`, **todas `"use client"`**, protegidas por `useAdminGuard()` (hook client-side, **bypasseável**). Páginas têm 133–374 linhas.

### 2.7. APIs BFF (`app/api/`)

**~30 routes** organizados em: auth, cities, ads, fipe, dashboard, painel, payments, plans, vehicle-images, admin (catch-all), diag, sitemap.
Maioria com `force-dynamic`. Sem uso de Redis apesar de `ioredis` estar instalado.

### 2.8. Sitemaps

11 routes: `sitemap.xml` (index) + 9 sitemaps temáticos + `regiao/[state].xml` dinâmico. **Cache trivial de 300s** — risco de 404 sob pico.

---

## 3. Mapa de componentes (`components/`)

**Total**: 119 componentes em 25 domínios (71 Client, 48 Server — 60/40).

### 3.1. Duplicação crítica #1 — Shell em 3 níveis

```
components/Header.tsx              (54 bytes — re-export estéril)
    ↓
components/layout/Header.tsx       (4.7 KB — órfão, ninguém importa)
    ↓
components/shell/PublicHeader.tsx  (10.5 KB — OFICIAL, usado em app/layout.tsx)
```

**Ação**: deletar `components/Header.tsx` e pasta `components/layout/` inteira.

### 3.2. Duplicação crítica #2 — 5 cards de anúncio

| Card | Usa AdCard? | Propósito | Veredito |
|---|---|---|---|
| `ads/AdCard.tsx` | — (base) | Canônico com `BaseAdData` | ✓ Manter |
| `ads/CarCard.tsx` | ✓ adapter | Compat legado | ✓ Manter |
| `common/VehicleCard.tsx` | ✓ adapter | `ListingCar → AdCard` | ✓ Manter |
| `home/HomeVehicleCard.tsx` | ✗ **reimplementa** | Home com variantes | 🚨 **Refatorar → variant de AdCard** |
| `buy/CatalogVehicleCard.tsx` | ✗ **reimplementa** | Catálogo com `weight` | 🚨 **Refatorar → variant de AdCard** |

Além disso, `home/sections/VehicleCard.tsx` é uma **sexta cópia duplicada** de `HomeVehicleCard`.

### 3.3. Duplicação crítica #3 — `lib/*` vs `services/*`

| Função | `lib/` | `services/` | Sobreposição |
|---|---|---|---|
| Ads | ✓ `lib/ads/` | ✓ `adService.ts` | 🚨 |
| Auth | ✓ `lib/auth/` | ✓ `authService.ts` | 🚨 |
| Session | ✓ `lib/session/` | ✓ `sessionService.ts` | 🚨 |
| Vehicle | ✓ `lib/vehicle/` | ✓ `vehicleService.ts` | 🚨 |
| Plans | ✗ | ✓ `planService.ts` + `planStore.ts` | ⚠️ |
| AI | ✗ | ✓ `aiService.ts` | ⚠️ |
| Market | ✗ | ✓ `marketService.ts` | ⚠️ |

**Violação explícita** do PROJECT_RULES. `services/` deve migrar para `lib/` ou ser deletado.

### 3.4. Componentes órfãos (~13 arquivos)

Sem nenhum import encontrado no projeto:

- `ads/AdDetailsPage.tsx`, `ads/AdListingCard.tsx` (predecessores de AdCard)
- `common/CTASection.tsx`, `FAQSection.tsx`, `FinancingSimulator.tsx`, `RegionalEntryHub.tsx`, `StatsSection.tsx`
- `buy/BuyPageShell.tsx`, `buy/VehicleBadge.tsx`
- `fipe/FipeVehicleCarousel.tsx`
- `modal/ExitIntentModal.tsx`
- `painel/new-ad-wizard/WizardSteps.tsx`
- `admin/AdminActionDialog.tsx`, `AdminEmptyState.tsx`, `AdminErrorState.tsx`, `AdminLoadingState.tsx`
- `layout/TerritorialHeaderLinks.tsx`

### 3.5. Padrões positivos (referências arquiteturais)

- **`components/search/`**: TerritorialResultsPageClient é a melhor arquitetura do repo — server-first com client boundary claro, SEO desacoplado, componentes reutilizáveis. **Usar como modelo**.
- **Tailwind 100%**: sem CSS modules, sem styled-components — consistência total.
- **PascalCase em arquivos**: 99% consistente.
- **2 contextos apenas** (`CityContext`, `FavoritesContext`) — uso disciplinado.
- **`ssrResilientFetch` wrapper**: exemplar para lidar com cold start e 429.

---

## 4. Riscos técnicos (por severidade)

### 🔴 CRÍTICO

| # | Risco | Onde | Mitigação obrigatória |
|---|---|---|---|
| 1 | SSR cold start | Next default 10s, backend pode levar 20-40s | **Toda nova página SSR deve usar `ssrResilientFetch`** |
| 2 | Rate limit 429 global | Sem `X-Cnc-Client-Ip` → todos SSR batem como 1 IP | Verificar `AUTH_SESSION_SECRET` em prod; monitorar 429 |
| 3 | Sitemap falha silenciosa | `try/catch` que engole erros → 2000+ URLs somem | Logar explicitamente quando fallback é acionado |
| 4 | Auth isolation breach | BFF pode vazar dados se validação esquecida | Code review obrigatório em `/app/api/painel/**` |
| 5 | URLs com mudança sem redirect | Perde PageRank instantâneo | Mapear toda rota removida para `middleware.ts` com 301 |
| 6 | `AUTH_SESSION_SECRET` ausente em prod | Restart do container invalida todas sessões | Verificar env var no Render |

### 🟠 ALTA

| # | Risco | Onde | Mitigação |
|---|---|---|---|
| 7 | Breadcrumb/JSON-LD removido no redesign | `components/seo/BreadcrumbJsonLd` | Testar presença via E2E |
| 8 | Canonical quebrado | 20+ `alternates.canonical` | Validar em cada página pública |
| 9 | `/favoritos` client-only | `"use client"` no topo | Migrar para server com `Suspense` |
| 10 | Admin client-only + guard fraco | `useAdminGuard()` client | Migrar para middleware server |
| 11 | `/veiculo/[slug]` 456 linhas | AI logic embutida | Extrair para `lib/vehicle/ai/` |

### 🟡 MÉDIA

| # | Risco | Onde | Mitigação |
|---|---|---|---|
| 12 | Bundle sem análise | Nenhum `next/bundle-analyzer` | Adicionar em dev |
| 13 | Zero `dynamic()` import | Tudo eager-loaded | Code-split componentes pesados |
| 14 | `sizes` ausente em imagens | CLS em mobile | Padronizar via `<AdCard>` |
| 15 | `remotePatterns: **` permissivo | Qualquer hostname aceito | Restringir a R2 + Unsplash |
| 16 | Sem banner LGPD | Se GTM/GA adicionado | Implementar antes de tracking |
| 17 | Redis instalado mas não usado | `ioredis` sem consumidores no BFF | Cache de FIPE, facets, cidades |

### 🟢 BAIXA

| # | Risco | Onde |
|---|---|---|
| 18 | `globals.css` 362 linhas | Pode ter cores duplicadas vs Tailwind tokens |
| 19 | E2E sem testes de falha SSR | Playwright só cobre happy path |
| 20 | Revalidate times inconsistentes | 60s vs 300s vs 1800s sem justificativa doc |

---

## 5. Páginas intocáveis (contrato de estabilidade)

Estas páginas **não podem regredir** durante todo o redesign. Qualquer PR que mexa nelas exige testes E2E passando:

1. **`/`** (home) — cabeça do funil
2. **`/veiculo/[slug]`** — página de conversão #1
3. **`/comprar/cidade/[slug]`** — 500+ páginas SEO por cidade
4. **`/cidade/[slug]`** — entrada territorial
5. **`/anuncios`** — listagem canônica
6. **`/sitemap.xml`** + todos os `/sitemaps/*.xml` — alimenta indexação
7. **`/api/auth/login`** — todo fluxo logado depende
8. **`/anunciar/novo`** — wizard de monetização
9. **`/dashboard/meus-anuncios`** — retenção de vendedores
10. **Middleware de redirect legado** (`/carros-em-*` hifenizado)

---

## 6. Testes existentes (contrato)

**11 specs Playwright**, 9 deles são invioláveis:

| Spec | Marca | Fluxo |
|---|---|---|
| `main-flow.spec.ts` | @smoke | Cadastro → publicação → detalhe |
| `full-flow.spec.ts` | @smoke | Variante estendida |
| `dashboard-login-pf-pj.spec.ts` | @smoke | Login PF + PJ |
| `10-login-ad-publish.spec.ts` | — | Login → publicar |
| `20-login-ad-checkout.spec.ts` | — | Login → checkout |
| `register-minimal-to-publish.spec.ts` | — | Cadastro mínimo |
| `publish-full-surface.spec.ts` | — | Publicação com todos campos |
| `user-isolation-api.spec.ts` | — | 🔒 Isolamento de dados |
| `anunciar-redirect.spec.ts` | — | Redirect legado |
| `vehicle-detail-premium.spec.ts` | — | Detalhe premium |
| `critical-pj-flow.spec.ts` | — | Placeholder (não rodar) |

**Regra**: todo PR do redesign deve rodar `npm run test:e2e:smoke` (no mínimo) antes de merge.

### Cobertura faltante (adicionar antes do redesign)

- ❌ Teste de SSR timeout (backend cold)
- ❌ Teste de sitemap.xml gerado corretamente
- ❌ Teste de canonical URL
- ❌ Teste de presença de JSON-LD/breadcrumb

---

## 7. Plano de fatiamento em PRs

Princípios:

- Cada PR **deploycável e reversível independentemente**.
- Progresso visível a cada merge — nada de big-bang.
- **Fase 0 (Consolidação)** vem antes de qualquer mudança visual — sem isso, redesign cresce sobre fundação duplicada.
- Feature flags não são necessárias porque cada PR entrega paridade funcional.

### 🧹 FASE 0 — Consolidação (pré-redesign)

**Objetivo**: remover duplicações e código morto. Não toca em UI. Nenhum usuário percebe.

**PR 0.1 — Shell: deletar `components/layout/`**
- Deletar `components/Header.tsx` (re-export estéril)
- Deletar pasta `components/layout/` inteira (Header, TerritorialHeaderLinks)
- Verificar via grep que nada importa antes
- **Risco**: nulo (órfãos confirmados)
- **Teste**: `npm run build && npm run test:e2e:smoke`

**PR 0.2 — Remover componentes órfãos**
- Deletar os 13 órfãos listados em §3.4
- Rodar em 2-3 passes, commitando em grupos
- **Risco**: baixo

**PR 0.3 — Remover rotas legadas redundantes**
- Deletar `/painel/anuncios/novo` (redirect puro → já coberto por middleware)
- Decidir `/anunciar/publicar`: consolidar no wizard ou deletar
- **Risco**: baixo (com redirect via middleware se necessário)

**PR 0.4 — Migrar `services/` → `lib/`**
- `adService → lib/ads/`, `authService → lib/auth/`, `sessionService → lib/session/`, `vehicleService → lib/vehicle/`
- Criar `lib/plans/`, `lib/ai/`, `lib/market/` para os que não têm equivalente
- Atualizar imports
- **Risco**: médio (refactoring amplo — precisa de testes)
- **Teste**: `npm run test:e2e` completo

### 🎨 FASE 1 — Sistema de Design

**PR 1 — Tokens + primitivos**
- Consolidar paleta em Tailwind tokens (`tailwind.config.ts`)
- Auditoria de `globals.css` — remover cores duplicadas
- Criar/revisar primitivos: `<Button>`, `<Input>`, `<Select>`, `<Chip>`, `<Badge>`, `<Card>`
- Tipografia: confirmar escala (12/14/16/20/24/32/40)
- **Entregável**: guia visual em `docs/DESIGN_SYSTEM.md` + componentes em `components/ui/`
- **Risco**: baixo (aditivo — não remove nada)

**PR 2 — `<CarCard>` unificado**
- Consolidar `HomeVehicleCard`, `CatalogVehicleCard`, `sections/VehicleCard` em variantes de `AdCard`
- Adicionar props `variant`, `weight`, `size`
- Manter `CarCard` e `VehicleCard` como adapters legados
- **Risco**: médio — testar todas as páginas que usam
- **Teste**: visual em home, catálogo, cidade, veículo, similares

### 🏠 FASE 2 — Home

**PR 3 — Nova home mobile-first**
- Aplicar novo design (referência: mockup aprovado)
- Header com localização clicável
- Busca protagonista + botão de filtros
- Chips de filtro rápido
- Atalhos circulares úteis (não FOMO)
- Hero regional (foto da cidade do usuário)
- `<CarCard>` em carrossel "Destaques em [cidade]"
- Seção Blog
- Bottom nav fixo no mobile
- **Risco**: alto (página crítica) — precisa teste manual + E2E
- **Rollback**: reverter commit (deploy anterior em 2 min no Render)

### 🚗 FASE 3 — Detalhe do veículo

**PR 4 — Nova `/veiculo/[slug]`**
- **Antes**: extrair AI logic de `page.tsx` (456 linhas) para `lib/vehicle/ai/`
- Galeria mobile-first em tela cheia (swipeable)
- Preço sticky no scroll
- CTA WhatsApp fixo no bottom (substitui bottom nav)
- Seções: ficha técnica expansível, opcionais em chips, vendedor, localização, similares
- **Risco**: altíssimo (conversão #1)
- **Teste**: `vehicle-detail-premium.spec.ts` obrigatório

### 🔍 FASE 4 — Busca / Catálogo

**PR 5 — Unificar `/comprar/*` e `/anuncios`**
- Decidir canônica (PROJECT_RULES diz `/anuncios`) e adicionar redirects 301 no middleware
- Nova listagem mobile-first: chips de filtros ativos, contador, ordenação, toggle grid/lista
- Drawer de filtros avançados (bottom sheet)
- **Risco**: alto (impacto SEO grande)
- **Validar**: canonical URLs corretos em cada variação

**PR 6 — Páginas territoriais `/cidade/[slug]/**`**
- Aplicar novo padrão, mantendo estrutura de rotas (sem mexer em URL)
- Referência: `components/search/` (já é boa arquitetura)
- **Risco**: médio

### 📝 FASE 5 — Anunciar

**PR 7 — Wizard `/anunciar/novo`**
- Multi-step visível, cada passo em 1 tela sem scroll
- Upload de fotos com reorder
- Indicador FIPE dinâmico em tempo real
- Preview antes de publicar
- **Risco**: alto (monetização)
- **Teste**: `10-login-ad-publish.spec.ts`, `publish-full-surface.spec.ts`

### 📰 FASE 6 — Blog + FIPE + Simulador

**PR 8 — Blog redesign**
- Lista com hero editorial + categorias + `<ArticleCard>`
- Artigo individual com reading progress, inline CTAs, artigos relacionados
- SEO: schema.org Article, URLs limpas
- **Risco**: baixo

**PR 9 — FIPE + Simulador redesign**
- Interface simplificada
- Integração com listagem ("ver carros deste modelo em Atibaia")
- **Risco**: baixo

### 🔐 FASE 7 — Auth

**PR 10 — Login / cadastro / recuperar senha**
- Design minimalista premium
- `/favoritos`: migrar de client para server com Suspense
- **Risco**: médio (cookies HttpOnly — não mexer)

### 👤 FASE 8 — Painel

**PR 11 — Dashboard PF + Lojista**
- Decidir: unificar em `/dashboard?role=...` ou manter separados mas DRY
- Aplicar novo design
- Admin: migrar de client-only para server com middleware real
- **Risco**: alto (segurança + retenção)
- **Teste**: `dashboard-login-pf-pj.spec.ts`, `user-isolation-api.spec.ts`

---

## 8. Checklist de validação por PR

Cada PR deve responder SIM a todas as perguntas abaixo antes do merge:

### Funcional
- [ ] `npm run build` passa
- [ ] `npm run lint` passa (max-warnings 0)
- [ ] `npm run typecheck` passa
- [ ] `npm run test` passa
- [ ] `npm run test:e2e:smoke` passa
- [ ] Teste manual em mobile real (ou DevTools em modo mobile)

### SSR / SEO
- [ ] Toda nova página SSR usa `ssrResilientFetch` (nunca `fetch` cru)
- [ ] `generateMetadata` presente em páginas públicas
- [ ] `alternates.canonical` correto
- [ ] `<h1>` único por página
- [ ] Breadcrumb/JSON-LD mantidos (se página os tinha antes)
- [ ] Nenhuma URL indexada removida sem 301 no `middleware.ts`
- [ ] `sitemap.xml` ainda gera sem erros

### Performance
- [ ] Imagens usam `next/image` com `sizes` adequado
- [ ] `priority` apenas em imagens acima da dobra
- [ ] Componentes pesados lazy-loaded com `dynamic()` quando aplicável
- [ ] Nenhum `"use client"` em página pública que possa ser server

### Segurança
- [ ] Nenhuma API key hardcoded
- [ ] BFF valida sessão em toda rota autenticada
- [ ] Cookies mantêm `httpOnly=true`, `secure=true` em prod, `sameSite`
- [ ] Nenhum `dangerouslySetInnerHTML` sem sanitização

### Arquitetura
- [ ] Shell oficial (`PublicHeader`/`PublicFooter`) usado — nenhum Header/Footer local
- [ ] Card oficial (`<AdCard>` via adapters) — sem novo card paralelo
- [ ] Nova integração em `lib/`, nunca em `services/`
- [ ] Sem componentes client quando server basta

---

## 9. Métricas de acompanhamento

Antes e depois de cada fase, coletar:

| Métrica | Como medir | Alvo |
|---|---|---|
| LCP mobile (home) | Lighthouse mobile | <2.5s |
| CLS mobile | Lighthouse mobile | <0.1 |
| TBT mobile | Lighthouse mobile | <200ms |
| Lighthouse Performance | mobile | >80 |
| Lighthouse SEO | mobile | >95 |
| Lighthouse Accessibility | mobile | >90 |
| Bundle JS crítico | `next build --profile` | <200KB |
| Páginas indexadas | Google Search Console | manter ou crescer |
| 429 rate limit | Render logs (últimos 7d) | 0 |

---

## 10. Próximos passos recomendados

### Agora (Etapa 2 — pré-execução)

1. **Aprovar este diagnóstico** — o usuário revisa, questiona, ajusta.
2. **Definir identidade visual final**: paleta (3 cores + neutros), tipografia, logo definitivo.
3. **Escrever `docs/DESIGN_SYSTEM.md`** com tokens, componentes e exemplos.

### Depois (Etapa 3 — execução)

4. **PR 0.1** (deletar shell duplicado) — aquecimento seguro, ganha confiança.
5. **PR 0.2–0.4** (limpeza) — base limpa antes de redesign.
6. **PR 1** (tokens + primitivos) — fundação do design system.
7. **PR 2** (`<CarCard>` unificado) — componente mais reutilizado.
8. **PRs 3–11** em ordem (home → detalhe → catálogo → anunciar → blog/FIPE/sim → auth → painel).

### Estimativa realista

| Fase | PRs | Tempo |
|---|---|---|
| 0 — Consolidação | 4 | 3-5 dias |
| 1 — Design System | 2 | 3-5 dias |
| 2 — Home | 1 | 3-4 dias |
| 3 — Detalhe | 1 | 4-5 dias |
| 4 — Busca/Catálogo | 2 | 5-7 dias |
| 5 — Anunciar | 1 | 4-5 dias |
| 6 — Blog/FIPE/Sim | 2 | 3-5 dias |
| 7 — Auth | 1 | 2-3 dias |
| 8 — Painel | 1 | 4-5 dias |
| **Total** | **15 PRs** | **~30-45 dias** |

---

## Apêndice A — Arquivos-chave para consulta

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

**Fim do diagnóstico.**
