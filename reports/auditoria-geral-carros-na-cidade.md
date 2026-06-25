# Auditoria Geral — Carros na Cidade

> **Data:** 2026-06-15
> **Branch/commit base:** `main` @ `818087f2`
> **Autor:** Auditoria técnica/produto (read-only, sem alteração de comportamento de produção)
> **Escopo:** Diagnóstico crítico do estado atual antes de abrir novas frentes de implementação.

⚠️ **Natureza desta auditoria:** análise crítica baseada em leitura de código (file:line). Onde a confirmação exige o banco de produção (ex.: "o admin mostra 0 posts"), o relatório indica o **comando read-only** para você validar no Render Shell antes de qualquer correção. Nada foi alterado.

---

## A. Sumário Executivo

### Estado atual
O projeto está **maduro e bem arquitetado** para um marketplace solo: backend Express modular (`src/modules/*`), frontend Next.js 14 App Router com BFF de admin protegido, 35 migrations idempotentes e rastreadas, motor de SEO programático, CMS de blog completo, moderação de anúncios com auditoria (`admin_actions`) e scaffolding sério de pagamentos. A higiene de segurança é acima da média (auth em camadas, renderer de markdown sem `dangerouslySetInnerHTML`, validação de upload R2, rate-limit granular).

O problema **não é falta de código** — é **código pronto que não foi "ligado"/executado em produção**. Há três peças construídas e testadas que estão dormentes:

1. **Blog CMS** — a adoção das matérias legadas (`scripts/blog/adopt-legacy-blog-posts.mjs`) **nunca foi rodada em produção**. Por isso o público mostra cards (fallback hardcoded) e o admin mostra 0 posts.
2. **Engine territorial** (`TerritorialSeoContentEngine`) — definida, testada, **mas não importada por nenhuma página**. O conteúdo factual prometido não chega ao HTML.
3. **ai-health UI** — endpoint pronto, método client pronto, **mas nenhuma tela consome**.

### Principais riscos
- **(CRÍTICO) Blog público é fachada estática.** Cards e "matérias" do `/blog` são um array TypeScript hardcoded, sem URL real de artigo para a maioria deles. SEO de blog está rendendo quase nada e o time não consegue editar nada pelo painel.
- **(ALTO) Páginas territoriais sem conteúdo factual.** Cidade/região/abaixo-da-FIPE têm JSON-LD correto, mas o bloco de texto factual (inventário, marcas, preço médio) que diferenciaria as páginas e alimentaria AI Overviews **não é renderizado** — risco de conteúdo fino/genérico em escala.
- **(ALTO) Pagamentos podem cobrar de verdade ao setar uma env var.** O fluxo Mercado Pago é real; basta `MP_ACCESS_TOKEN` para sair do mock. Sem conciliação, reembolso nem testes sandbox validados, ligar isso é perigoso.
- **(MÉDIO) Custo de escala SSR.** Cidade/região/veículo usam `force-dynamic` (workaround do soft-404 do Next 14.2) — não cacheiam por ISR; com milhares de cidades isso pesa.

### O que está bom (não mexer)
- JSON-LD do **veículo já corrigido**: emite **Product + Car** como nós de tipo único (Fase 4.3.1). ✅
- **Abaixo da FIPE já corrigido**: emite **BreadcrumbList + FAQPage** além de CollectionPage/ItemList. ✅
- Home com **WebSite + SearchAction + Organization**. ✅
- Moderação de anúncios, arquivamento e denúncia com **auditoria e reason obrigatório**. ✅
- **Vazamento de anúncio bloqueado/arquivado: não há** — query pública filtra `status='active'`. ✅
- Migrations 032–035 **aditivas e idempotentes**; 035 isola corretamente CMS (`source='cms'`) do motor de SEO (`source='seo'`). ✅

### O que impede avanço
A próxima rodada de features (mais editorial, Mercado Pago, expansão territorial) **depende de fechar primeiro o blog e ligar a engine territorial**. Abrir essas frentes sem isso multiplica superfície de bug. Recomendação: **executar a adoção do blog (1 comando) e a UI mínima territorial/ai-health antes de qualquer feature nova.**

---

## B. Diagnóstico por Área

### B.1 Blog / CMS — **foco principal**

#### Como funciona hoje (cadeia completa, verificada)
- **Público hub:** [`frontend/app/blog/[cidade]/page.tsx`](frontend/app/blog/[cidade]/page.tsx) é uma **rota dual**:
  1. se `params.cidade` casar com slug de post `published` do CMS → renderiza o **artigo** (`CmsBlogPostArticle`) com canonical `/blog/<slug>`;
  2. senão → renderiza o **hub editorial** (`BlogPageClient`).
- **Fonte dos cards (a resposta-chave):** o hub chama em paralelo `fetchBlogPageContent()` (fallback) e `fetchPublishedBlogPosts()` (CMS). A precedência (linhas 130–140) é:
  - **se o CMS tem posts → mostra SOMENTE CMS;**
  - **se o CMS está vazio → mostra o fallback hardcoded.**
- **Fallback hardcoded:** [`frontend/lib/blog/blog-page.ts:138-318`](frontend/lib/blog/blog-page.ts) (`buildFallbackContent`) — 6 featured + 4 trending + 3 popular **escritos à mão em TypeScript**. A maioria desses cards aponta para slugs que **não têm artigo real** (ex.: `melhores-roteiros-final-semana`, `como-manter-revisao-em-dia`).
- **Admin:** [`src/modules/admin/blog/admin-blog.repository.js:72-113`](src/modules/admin/blog/admin-blog.repository.js) lista **somente `source='cms'`**.

#### Respostas objetivas às perguntas do briefing
| Pergunta | Resposta |
|---|---|
| De onde vêm os cards do blog público? | Do **array hardcoded** `buildFallbackContent` em `frontend/lib/blog/blog-page.ts`. |
| Eles existem no banco? | **Não.** São conteúdo estático do frontend. |
| Estão em `blog_posts`? | **Não.** |
| Qual o `source` deles? | Nenhum — não são linhas de banco. |
| Por que o admin mostra 0 posts? | Porque o admin lista `source='cms'` e **não há nenhuma linha `cms`** (a adoção não foi executada). |
| O CMS filtra `source='cms'` corretamente? | **Sim** — repository e service filtram em todas as leituras (admin e público). |
| Há fallback hardcoded? | **Sim**, e é exatamente a origem do que aparece. |
| Há duplicidade fallback × CMS? | **Não no runtime** — a precedência (4.2.1) faz CMS *substituir* o fallback quando existe. O risco é só visual enquanto houver poucos posts. |
| O endpoint público usa CMS ou fallback? | Usa **os dois**: tenta CMS, cai no fallback se vazio. |
| O editor consegue editar um post adotado? | **Sim** — depois de adotado vira `source='cms'`, editável pelo painel. |
| Post publicado aparece no público? | **Sim** (filtro `status='published'`). |
| Ao despublicar, some do público? | **Sim** — `unpublishPost` → 404 público (`findPublishedBySlug`). |
| O sitemap inclui só publicados? | Sim, o sitemap de blog usa a leitura published do CMS (ver B.2). |
| O JSON-LD BlogPosting aparece no HTML? | **Sim**, no artigo (`buildCmsPostJsonLd`) — mas só existe artigo para posts do CMS; hoje, nenhum. |

#### Diagnóstico raiz
**A infraestrutura do CMS está 100% pronta e correta.** O que falta é **um comando**: a Fase 4.2.1 entregou o script de adoção ([`scripts/blog/adopt-legacy-blog-posts.mjs`](scripts/blog/adopt-legacy-blog-posts.mjs)) que canoniza as 13 matérias legadas ([`src/modules/admin/blog/legacy-blog-seed.js`](src/modules/admin/blog/legacy-blog-seed.js)) como posts `source='cms'`, `status='published'`. O script é idempotente (chave = slug), tem `--dry-run` por padrão e registra `admin_actions`. **Ele não foi rodado em produção** — confirmado pela existência do reporter read-only de handoff ([`scripts/blog/blog-posts-status.mjs`](scripts/blog/blog-posts-status.mjs)), que literalmente imprime `(nenhum — o admin mostraria "0 posts")` quando não há linhas `cms`.

#### Plano para resolver o blog
1. **Confirmar** (read-only) no Render Shell: `node scripts/blog/blog-posts-status.mjs` → ver bloco `[C]`.
2. **Dry-run:** `node scripts/blog/adopt-legacy-blog-posts.mjs --dry-run` → deve listar 13 `INSERT`.
3. **Aplicar:** `node scripts/blog/adopt-legacy-blog-posts.mjs --apply`.
4. Validar: admin lista 13 posts; público passa a servir CMS; cada card tem artigo real em `/blog/<slug>`.
5. **Depois** (limpeza, não urgente): reduzir/aposentar o fallback hardcoded para evitar divergência de manutenção — manter só como esqueleto de layout para CMS vazio.

> Observação crítica de SEO a verificar junto: os cards do hub linkam para `/blog/<cidade>/<slug>` ([`page.tsx:138`](frontend/app/blog/[cidade]/page.tsx)), enquanto o canonical do post é `/blog/<slug>`. Confirme que [`frontend/app/blog/[cidade]/[slug]/page.tsx`](frontend/app/blog/[cidade]/[slug]/page.tsx) emite `canonical = /blog/<slug>` para não criar URL duplicada por cidade. (Ver P7.)

### B.2 SEO / IA

- **Veículo** [`frontend/app/veiculo/[slug]/page.tsx`] + [`frontend/lib/seo/vehicle-structured-data.ts:74-152`](frontend/lib/seo/vehicle-structured-data.ts): **Product (com Offer) + Car** como **dois nós de tipo único** → Product e Car **detectáveis**. Também BreadcrumbList, FAQPage, ImageObject, AutoDealer/Person. **PENDÊNCIA RESOLVIDA.** ✅
- **Abaixo da FIPE** [`frontend/lib/seo/local-seo-route.tsx:59-93`](frontend/lib/seo/local-seo-route.tsx): para `variant="baratos"` emite **BreadcrumbList** (`buildBaratosBreadcrumbJsonLd`) + **FAQPage VISÍVEL** (`buildBelowFipeFaqEntries`) + CollectionPage + ItemList. **PENDÊNCIA RESOLVIDA.** ✅
- **Home** [`frontend/lib/seo/home-structured-data.ts`]: WebSite + **SearchAction** (sitelinks search box) + Organization. ✅
- **Cidade** [`frontend/app/carros-em/[slug]/page.tsx`]: CollectionPage + BreadcrumbList + ItemList + FAQPage; `index,follow`. ✅
- **Região** [`frontend/app/carros-usados/regiao/[slug]/page.tsx`]: CollectionPage + BreadcrumbList + ItemList + Place; **sem FAQ** (removida por briefing 2026-05-23). Canonical e indexação por flags (`REGIONAL_PAGE_CANONICAL_SELF`, `shouldIndexRegionalPage`).
- **Sitemaps** [`frontend/app/sitemap.xml/route.ts`, `frontend/app/sitemaps/*`]: índice com core/content/cities/local-seo/brands/models/opportunities/below-fipe/blog/regiao-por-estado; `lastmod` presente; blog usa `updated_at||published_at`.
- **ai-health** [`src/modules/admin/seo/admin-seo-ai.service.js`]: endpoint `GET /api/admin/seo/ai-health` retorna score de anúncios, saúde do blog e contagem territorial indexável/noindex. **Lacuna:** o método `adminApi.seo.aiHealth()` ([`frontend/lib/admin/api.ts:155`](frontend/lib/admin/api.ts)) **não é chamado por nenhuma tela** — a página `/admin/seo` consome overview/publications/sitemaps/issues, mas **não ai-health**. Tela faltando.

**Riscos SEO/IA:** (a) páginas indexáveis com inventário baixo (city pages não têm threshold de mínimo de anúncios — só região tem `REGIONAL_INDEX_MIN_ADS`); (b) conteúdo factual ausente (ver B.3) reduz a chance de AI Overviews; (c) blog sem artigos reais → sitemap de blog quase vazio.

### B.3 Páginas territoriais

- **Engine:** [`frontend/lib/seo/territorial-content-engine.ts`](frontend/lib/seo/territorial-content-engine.ts) — `buildTerritorialSeoContent()` gera title/meta/h1/intro/stats/highlights/FAQ/JSON-LD **a partir de dados reais** (activeAds, belowFipeAds, topBrands, topModels, avgPrice, nearby) com a "regra de ouro": **nunca inventar estatística** (frase sem dado é omitida). Política de indexação por thresholds (`cityMinAds=3`, `regionMinAds=5`, `belowFipeMinAds=2`, `stateMinAds=1`) + flag estratégica.
- **CRÍTICO — está DORMENTE.** Busca por `buildTerritorialSeoContent` retorna **apenas** o próprio arquivo e seu teste. **Nenhuma página importa a engine.** As páginas cidade/abaixo-da-FIPE usam o caminho legado (`createLocalSeoPage`/`loadLocalSeoLanding`).
  - A engine territorial **não está conectada** às páginas públicas.
  - O usuário **não vê** os blocos factuais.
  - O Google **não vê** esses blocos no HTML.
  - Risco de conteúdo genérico/repetido: **alto**, porque hoje as páginas territoriais não têm o diferencial factual.
- **Hardcode de Atibaia:** **não há** em páginas de produção (só em testes/relatórios). A arquitetura é **nacional/escalável** (tudo parametrizado por dados) — o bloqueio é só a ausência do ponto de integração.

### B.4 Anúncios e confiança

- **Status canônicos** [`src/shared/constants/status.js`]: `active, pending_review, paused, sold, expired, rejected, deleted, blocked, archived, draft`. `AD_STATUS_PUBLIC=['active']`.
- **Público filtra `status='active'`** na própria query [`src/modules/ads/ads.repository.js:142`] → **bloqueado/arquivado/deletado não vazam.** ✅
- **Denúncia** não remove anúncio automaticamente; cria entrada em `ad_reports`, aparece em `/admin/denuncias`; resolver/dispensar exige reason + auditoria. ✅
- **Destaque manual** exige reason (≥3 chars) — `requireReasonForHighlightAction` [`src/modules/admin/ads/admin-ads.service.js`]; destaque não bumpa `priority` (Fase 3.3). ✅
- **Arquivamento** preserva histórico (aba history, Fase 3.5); restore disponível. ✅
- **admin_actions** registra status, destaque, boost, archive/restore, moderação, denúncia, plano, blog. ✅
- **Score SEO/IA do anúncio** existe (campo `ad.seo_ai`, consumido pelo ai-health). Falta a **tela** que mostra isso ao admin no detalhe do anúncio.

### B.5 Painel admin (12 módulos)

| Módulo | Estado | Observação |
|---|---|---|
| Anunciantes | Funcional | status active/suspended/blocked + auditoria |
| Anúncios | Funcional | mutações com reason + auditoria |
| Moderação | Funcional | fila por risk_score; approve/reject/correção |
| Denúncias | Funcional | workflow new→in_review→resolved/dismissed |
| Comercial/Planos | Funcional | planos + destaques + regras (reason) |
| Conteúdo/Home | Funcional | carrossel 3 banners (estabilizado Fase 4.1.x) |
| **Conteúdo/Blog** | **Funcional mas vazio** | **mostra 0 posts — bug prioritário (B.1)** |
| SEO | Funcional parcial | overview/publications/sitemaps/issues OK; **falta tela ai-health** |
| Métricas | Funcional | read-only |
| Pagamentos | Funcional (read-only) | lista `payment_intents`; sem conciliação/reembolso |
| Regional settings | Funcional mínimo | edita raio + reason |
| **Configurações** | **Stub** | página existe, sem mutação real |

Permissões: BFF `frontend/app/api/admin/[...path]` valida sessão admin antes de proxyar; backend aplica `authMiddleware` + `requireAdmin()` globalmente. ✅

### B.6 Pagamentos / Mercado Pago — **NÃO ativar ainda**

**Classificação: PARCIAL (scaffolding sério, sem tráfego real).**
- Checkout real de planos/boost/assinatura ([`src/modules/payments/payments.service.js`]): cria `payment_intents`, chama `/checkout/preferences` da MP **se houver `MP_ACCESS_TOKEN`**, com `X-Idempotency-Key`.
- Webhook ([`payments.service.js:973+`]): valida **HMAC-SHA256** com `MP_WEBHOOK_SECRET`; em produção **secret ausente é fatal no boot** (bom); reaplica regra de negócio (boost só para anúncio `active`, sem dobrar assinatura).
- Tabelas: `payment_intents` (migration 020), `payments`, `user_subscriptions`. Admin de pagamentos é read-only.
- **Faltam para liberar cobrança:** credenciais sandbox→prod testadas, conciliação MP×banco, fluxo de **reembolso/cancelamento** (inexistente), idempotência ponta-a-ponta validada em sandbox, painel de reconciliação, política de reembolso.
- **Risco:** setar `MP_ACCESS_TOKEN` em prod sai do mock e passa a cobrar. **Recomendo um gate explícito** (`PAYMENTS_LIVE_ENABLED`) para evitar ativação acidental.

### B.7 Segurança e permissões

- **Auth/roles:** sólido. `requireAdmin()` antes de todo handler admin; BFF valida sessão. ✅
- **Sanitização do blog:** renderer próprio ([`frontend/lib/blog/markdown.tsx`]) **sem `dangerouslySetInnerHTML`**; bloqueia `javascript:/data:/file:/vbscript:` (regex `SAFE_LINK_RE`); backend rejeita esquemas perigosos no save (`DANGEROUS_LINK_RE`). ✅
- **Upload R2** ([`src/infrastructure/storage/r2.service.js`]): whitelist de MIME, limite de tamanho (10MB default), sanitização de path (sem traversal). ✅
- **Revalidate** ([`frontend/app/api/revalidate/route.ts`]): exige `REVALIDATE_TOKEN`, whitelist de paths/tags. **Fraqueza baixa:** comparação de token com `!==` (não `timingSafeEqual`); idem token interno em [`src/modules/regions/regions.middleware.js`].
- **Rate-limit/CORS:** limites granulares por rota; CORS whitelisted. ✅

### B.8 Banco e migrations

- **Runner** [`scripts/run-migrations.mjs` → `src/infrastructure/database/migrate.js`]: tabela `schema_migrations` (filename UNIQUE + checksum SHA256), advisory lock contra concorrência, skip por idempotência. ✅
- **032 (ads archive), 033 (home_sections), 034 (carousel):** aditivas, `IF NOT EXISTS`, sem risco. ✅
- **035 (blog_posts):** a mais delicada — tabela **já existia** em produção (criada fora das migrations pelo motor de SEO). A versão atual é **aditiva** (`ADD COLUMN IF NOT EXISTS` para tudo), faz `DROP NOT NULL` de city/brand/model, backfill com `WHERE IS NULL`, CHECKs `NOT VALID`, índice único de slug guardado por `pg_index`. Discriminador `source` ('seo' default / 'cms' painel). **Corrige o boot quebrado** da versão anterior (índice em `published_at` inexistente). ✅
- **Risco residual:** o `default` de `source` é `'seo'`; qualquer INSERT do CMS que **não** force `source` viraria 'seo'. O repository do CMS **sempre** carimba `source='cms'` ([`admin-blog.repository.js:162`]) — ok, mas é uma invariante a não quebrar.

### B.9 UX / Performance

- **Home:** carrossel de 3 banners como peça pronta (object-cover desktop / arte preservada mobile), altura consistente, autoplay — estabilizado nas Fases 4.1.1–4.1.5.
- **SSR custo de escala:** cidade/região/veículo são `force-dynamic` (workaround do soft-404 do Next 14.2 com `notFound()`+ISR). Funciona, mas **não cacheia por ISR** — com muitas cidades, custo de render e TTFB sobem. Item de dívida técnica.
- **Imagens:** R2 + normalização (webp/avif); alt automático no veículo. Avaliar `next/image` sizes e LCP do hero mobile (já reduzido ~220px).
- **Blog mobile / cards / bottom nav:** dependem do hub — hoje renderizando fallback; reavaliar peso após adoção.

---

## C. Lista priorizada de problemas

> Severidade: **Crítico** (bloqueia/contradiz o produto) · **Alto** · **Médio** · **Baixo**.

### P1 — [CRÍTICO] Blog público é hardcoded; CMS vazio; admin mostra 0 posts
- **Evidência:** `frontend/lib/blog/blog-page.ts:138-318` (fallback); `src/modules/admin/blog/admin-blog.repository.js:72` (`source='cms'`); reporter `scripts/blog/blog-posts-status.mjs`.
- **Impacto:** time não edita blog; SEO de blog ~nulo; artigos linkados sem destino real.
- **Recomendação:** rodar a adoção (P1 do roadmap). Infra já pronta.
- **Esforço:** **XS** (1 comando + validação). **Risco de produção:** Baixo (idempotente, dry-run, auditado).

### P2 — [ALTO] Engine territorial dormente (não renderiza conteúdo factual)
- **Evidência:** `buildTerritorialSeoContent` referenciado só em `territorial-content-engine.ts` + `.test.ts`; páginas usam `createLocalSeoPage` legado.
- **Impacto:** páginas cidade/região/abaixo-FIPE sem diferencial factual; risco de conteúdo fino em escala; perde AI Overviews.
- **Recomendação:** wirar a engine em 1 página piloto (cidade) com dados reais (activeAds, topBrands, avgPrice), renderizar bloco visível no HTML SSR, validar, depois expandir.
- **Esforço:** **M** (1–2 dias piloto). **Risco:** Médio (mudança de conteúdo público — fazer atrás de flag).

### P3 — [ALTO] Pagamentos podem cobrar ao setar env var, sem gate explícito
- **Evidência:** `src/modules/payments/payments.service.js` (mock só enquanto falta `MP_ACCESS_TOKEN`).
- **Impacto:** ativação acidental = cobrança real sem conciliação/reembolso.
- **Recomendação:** introduzir `PAYMENTS_LIVE_ENABLED` como gate duro; não tocar em credenciais até checklist de pagamentos completo.
- **Esforço:** **S** (gate) / **L** (subsistema completo). **Risco:** Alto se ignorado.

### P4 — [MÉDIO] Falta tela admin consumindo ai-health
- **Evidência:** `frontend/lib/admin/api.ts:155` define `aiHealth()`, sem caller.
- **Impacto:** score SEO/IA e saúde do blog/anúncios invisíveis ao operador.
- **Recomendação:** aba "Saúde IA" em `/admin/seo` consumindo o endpoint existente.
- **Esforço:** **S**. **Risco:** Baixo (read-only).

### P5 — [MÉDIO] City pages sem threshold de indexação por inventário
- **Evidência:** só região tem `REGIONAL_INDEX_MIN_ADS`; `/carros-em/[slug]` indexa sempre.
- **Impacto:** indexar cidades com 0–1 anúncio = conteúdo fino, diluição de crawl.
- **Recomendação:** aplicar a política da engine territorial (`cityMinAds`) à indexação + sitemap.
- **Esforço:** **S–M**. **Risco:** Médio (muda indexação — medir antes).

### P6 — [MÉDIO] SSR force-dynamic em cidade/região/veículo (custo de escala)
- **Evidência:** `export const dynamic = "force-dynamic"` (workaround soft-404 Next 14.2).
- **Impacto:** sem ISR, TTFB/custo sobem com volume.
- **Recomendação:** reavaliar com Next atualizado ou padrão de 404 explícito que permita ISR.
- **Esforço:** **M**. **Risco:** Médio.

### P7 — [MÉDIO] Possível URL duplicada de post: `/blog/<slug>` vs `/blog/<cidade>/<slug>`
- **Evidência:** hub linka `/blog/<cidade>/<slug>` (`page.tsx:138`); canonical do post é `/blog/<slug>`.
- **Impacto:** duplicação se `[cidade]/[slug]` não canonicalizar para `/blog/<slug>`.
- **Recomendação:** confirmar/forçar canonical global em `frontend/app/blog/[cidade]/[slug]/page.tsx`.
- **Esforço:** **XS** (verificação). **Risco:** Baixo.

### P8 — [MÉDIO] Módulo Configurações é stub
- **Evidência:** `frontend/app/admin/configuracoes/page.tsx` sem mutação real.
- **Impacto:** expectativa de funcionalidade inexistente.
- **Recomendação:** ocultar/("em breve") ou implementar o mínimo (ex.: thresholds territoriais, flags).
- **Esforço:** **S**. **Risco:** Baixo.

### P9 — [BAIXO] Tokens internos sem comparação timing-safe
- **Evidência:** `frontend/app/api/revalidate/route.ts` (`!==`); `src/modules/regions/regions.middleware.js`.
- **Impacto:** ataque de timing teórico (mitigado por alta entropia do token).
- **Recomendação:** `crypto.timingSafeEqual`.
- **Esforço:** **XS**. **Risco:** Baixo.

### P10 — [BAIXO] Fallback hardcoded do blog vira dívida pós-adoção
- **Evidência:** `blog-page.ts` mantém 13 cards estáticos mesmo após CMS popular.
- **Impacto:** divergência de manutenção, conteúdo desatualizado se CMS esvaziar.
- **Recomendação:** reduzir a esqueleto de layout; remover dados específicos após adoção estável.
- **Esforço:** **S**. **Risco:** Baixo.

---

## D. Roadmap recomendado

### Fase imediata (esta semana — desbloqueio)
1. **Adotar o blog no CMS** (P1): `blog-posts-status` → `--dry-run` → `--apply` no Render Shell. Validar admin (13 posts) e público (CMS).
2. **Verificar canonical do post** (P7): garantir `/blog/<cidade>/<slug>` → canonical `/blog/<slug>`.
3. **Validar JSON-LD crítico em produção** (smoke E): veículo (Product+Offer+Car), abaixo-da-FIPE (Breadcrumb+FAQ), home (WebSite/SearchAction), blog post (BlogPosting).
4. **Gate de pagamentos** (P3, parte barata): introduzir `PAYMENTS_LIVE_ENABLED=false` antes de qualquer credencial.

### Fase seguinte (próximas 2–3 semanas — diferencial)
5. **Wirar engine territorial** (P2) em piloto de cidade, atrás de flag, com dados reais; medir; expandir para região e abaixo-da-FIPE.
6. **UI ai-health** (P4) em `/admin/seo`.
7. **Score SEO/IA no detalhe do anúncio** (admin) consumindo `ad.seo_ai`.
8. **Threshold de indexação de cidade** (P5) + refletir no sitemap.

### Fase posterior (mês+ — monetização e conteúdo)
9. **Mercado Pago** completo: sandbox→prod, webhook validado em sandbox, idempotência ponta-a-ponta, tabela/conciliação, **reembolso/cancelamento**, painel financeiro, testes.
10. **Conteúdo editorial ampliado** no blog (expandir as 13 matérias adotadas, novas categorias) e **reduzir fallback hardcoded** (P10).
11. **Revisitar SSR→ISR** (P6) e timing-safe tokens (P9).

---

## E. Checklist de smoke para produção

> Rodar no **Render Shell do service backend** (tem `DATABASE_URL`/pool/SSL prontos) salvo onde indicado "qualquer máquina". Comece sempre pelos **read-only**.

### E.1 Blog — admin lista posts / público usa CMS (read-only primeiro)
```bash
# [READ-ONLY] estado atual da tabela compartilhada e dos 13 slugs alvo:
node scripts/blog/blog-posts-status.mjs
# Esperado HOJE: bloco [C] = "(nenhum — o admin mostraria 0 posts)"

# Dry-run da adoção (não grava):
node scripts/blog/adopt-legacy-blog-posts.mjs --dry-run
# Esperado: 13 linhas "＋ INSERT"

# Aplicar (grava source='cms', status='published', auditado):
node scripts/blog/adopt-legacy-blog-posts.mjs --apply

# Conferir:
node scripts/blog/blog-posts-status.mjs
# Esperado: [A] cms/published = 13 ; [C] lista 13 posts
```
```bash
# API pública passa a servir CMS (qualquer máquina):
curl -s "https://www.carrosnacidade.com/api/public/blog/posts?limit=3" | head -c 600
# Esperado: {"success":true,"data":[... 3 posts ...],"total":13,...}

# Detalhe de um post adotado:
curl -s "https://www.carrosnacidade.com/api/public/blog/posts/como-comprar-carro-usado-com-seguranca" | head -c 400
```

### E.2 Veículo tem Product + Offer + Car (qualquer máquina)
```powershell
# PowerShell — troque <slug> por um anúncio ativo real:
$h = (Invoke-WebRequest "https://www.carrosnacidade.com/veiculo/<slug>").Content
foreach ($t in '"@type":"Product"','"@type":"Offer"','"@type":"Car"','"@type":"FAQPage"','BreadcrumbList') {
  "{0,-28} {1}" -f $t, ($(if ($h -match [regex]::Escape($t)) {'OK'} else {'FALTA'}))
}
```

### E.3 Abaixo da FIPE tem Breadcrumb + FAQ (qualquer máquina)
```powershell
$h = (Invoke-WebRequest "https://www.carrosnacidade.com/carros-baratos-em/<cidade-uf>").Content
foreach ($t in 'CollectionPage','ItemList','BreadcrumbList','"@type":"FAQPage"') {
  "{0,-22} {1}" -f $t, ($(if ($h -match [regex]::Escape($t)) {'OK'} else {'FALTA'}))
}
```

### E.4 Páginas territoriais têm conteúdo factual (vai FALHAR até P2)
```bash
# Procurar bloco factual no HTML SSR da cidade (inventário/preço médio/marcas):
curl -s "https://www.carrosnacidade.com/carros-em/<cidade-uf>" \
  | grep -Eio "anúncio(s)? ativo|preço médio|marcas mais|abaixo da fipe" | sort -u
# Esperado HOJE: pouco/nada (engine dormente) → confirma P2.
```

### E.5 Anúncios bloqueados/arquivados não vazam (read-only no backend)
```bash
# Nenhum anúncio não-active deve aparecer na listagem pública:
curl -s "https://www.carrosnacidade.com/api/ads?limit=50" \
  | grep -Eo '"status":"[a-z_]+"' | sort | uniq -c
# Esperado: somente "status":"active"
```

### E.6 Pagamentos NÃO ativos indevidamente (read-only no backend)
```bash
# Deve estar em mock (sem token) — confirme que MP não está setado em prod:
node -e "console.log('MP_ACCESS_TOKEN set?', !!process.env.MP_ACCESS_TOKEN, '| WEBHOOK_SECRET set?', !!process.env.MP_WEBHOOK_SECRET)"
# Esperado para 'não cobrar ainda': MP_ACCESS_TOKEN = false
```

### E.7 Sitemaps respeitam published/indexável (qualquer máquina)
```bash
curl -s "https://www.carrosnacidade.com/sitemaps/blog.xml" | grep -c "<url>"
# Esperado APÓS adoção: 13 (ou nº de posts published)
```

---

## Apêndice — Mapa rápido do projeto

- **Backend** (`src/`): `modules/{ads,admin,advertisers,payments,finance,commercial,seo,regions,cities,public,...}`, `infrastructure/{database,storage,cache,queue}`, `database/migrations` (035), `shared/{middlewares,constants}`.
- **Frontend** (`frontend/`): `app/` (rotas públicas + `admin/` + `api/` BFF), `lib/{blog,seo,admin,env,city}`, `components/{blog,home,ads,shell,admin}`.
- **Integrações:** PostgreSQL (Render), Cloudflare R2 (imagens), Mercado Pago (scaffolding, mock), FIPE.
- **Cache/revalidate:** tags `public-home-hero`, `public-home`, `public-blog`; ISR 300s (blog), 3600s (home); paths `/`, `/blog`.
- **`blog_posts` compartilhada:** `source='cms'` (painel) vs `source='seo'` (motor). CMS público = `source='cms' AND status='published'`.
