# ROUTE_CANONICAL_MAP — Mapa de rotas canônicas e redirects

| Campo | Valor |
|---|---|
| **Versão** | 1 |
| **Data** | 2026-04-24 |
| **Branch** | `claude/sad-elbakyan-8155e1` |
| **Status** | 📜 PR A — Contrato de estabilidade (sem mudança funcional) |
| **Referência** | [DIAGNOSTICO_REDESIGN.md](./DIAGNOSTICO_REDESIGN.md) §8.1 |
| **Aplicação** | Toda mudança de rota em qualquer PR exige atualização deste mapa + teste E2E do redirect |

---

## 0. Princípios

1. **Uma URL por conteúdo**. Aliases são redirects 301, não páginas duplicadas.
2. **Páginas SEO de palavra-chave** (`/carros-em/*`, etc.) podem coexistir com canônicas se tiverem **conteúdo diferenciado** — `canonical="self"`.
3. **Toda rota removida ou renomeada** tem entrada em `frontend/middleware.ts` com 301.
4. **Mudanças no mapa exigem snapshot automatizado** antes/depois (§8.2 do diagnóstico).
5. **`/anuncios` é canônica para listagem geral** (PROJECT_RULES); **`/cidade/{slug}` é canônica para territorial** (PROJECT_RULES).

---

## 1. Tabela mestre — todas as rotas

### 1.1. Home

| Rota | Função | Indexável | Canonical | Aliases | Redirects | Removível |
|---|---|---|---|---|---|---|
| `/` | Home pública | ✓ | `https://carrosnacidade.com/` | — | — | ❌ Nunca |

### 1.2. Listagem geral

| Rota | Função | Indexável | Canonical | Aliases | Redirects | Removível |
|---|---|---|---|---|---|---|
| `/anuncios` | Listagem canônica geral | ✓ | self | — | — | ❌ Nunca |
| `/anuncios/[identifier]` | Redirect legado | ✗ | — | — | → `/veiculo/[slug]` (já existente) | ✅ Após PR I confirmar zero referências |

### 1.3. Comprar (alias operacional)

`/comprar/*` é **alias operacional** que **deve consolidar** em `/anuncios` ou `/cidade/{slug}`. Decisão final no PR J.

| Rota | Função | Indexável | Canonical | Aliases | Redirects (PR J) | Removível |
|---|---|---|---|---|---|---|
| `/comprar` | Entry territorial (atual: redirect interno) | ⚠️ Avaliar | → `/anuncios` ou home | — | considerar 301 → `/anuncios` | ✅ Após PR J |
| `/comprar/[slug]` | Alias cidade | ⚠️ | `/cidade/{slug}` | `/comprar/cidade/{slug}` | 301 → `/cidade/{slug}` | ✅ Após PR J + redirect ativo |
| `/comprar/cidade/[slug]` | Paralelo cidade | ⚠️ | `/cidade/{slug}` | `/comprar/{slug}` | 301 → `/cidade/{slug}` | ✅ Após PR J + redirect ativo |
| `/comprar/estado/[uf]` | Busca por estado | ✓ | self | — | — | ❌ Nunca (PROJECT_RULES) |

**Regra para PR J**: redirects 301 entram em `middleware.ts` **antes** de qualquer mudança de UI. Snapshot automatizado precisa confirmar que rotas antigas devolvem 301 e canônicas devolvem 200.

### 1.4. Páginas territoriais (canônicas)

| Rota | Função | Indexável | Canonical | Removível |
|---|---|---|---|---|
| `/cidade/[slug]` | Cidade — listagem | ✓ | self | ❌ Nunca |
| `/cidade/[slug]/marca/[brand]` | Cidade + marca | ✓ | self | ❌ Nunca |
| `/cidade/[slug]/marca/[brand]/modelo/[model]` | Cidade + marca + modelo | ✓ | self | ❌ Nunca |
| `/cidade/[slug]/oportunidades` | Oportunidades por cidade | ✓ | self | ❌ Nunca |
| `/cidade/[slug]/abaixo-da-fipe` | Abaixo da FIPE por cidade | ✓ | self | ❌ Nunca |

**Volume**: ~5.500 páginas indexáveis na primeira fase, crescendo para 20.000+. Qualquer alteração precisa snapshot automatizado.

### 1.5. SEO de palavra-chave (coexistem com canônicas)

| Rota | Função | Indexável | Canonical | Conteúdo | Removível |
|---|---|---|---|---|---|
| `/carros-em/[slug]` | "carros em [cidade]" | ✓ | self | Próprio (não pode duplicar `/cidade/{slug}`) | ❌ Nunca |
| `/carros-baratos-em/[slug]` | "carros baratos em [cidade]" | ✓ | self | Próprio | ❌ Nunca |
| `/carros-automaticos-em/[slug]` | "carros automáticos em [cidade]" | ✓ | self | Próprio | ❌ Nunca |
| `/carros-em-[slug]` (hifenizado) | Legado | ✗ | — | — (redirecionado) | redirect existe em `middleware.ts` |
| `/carros-baratos-em-[slug]` (hifenizado) | Legado | ✗ | — | — | redirect existe |
| `/carros-automaticos-em-[slug]` (hifenizado) | Legado | ✗ | — | — | redirect existe |

**Regra**: estas páginas **devem ter conteúdo distinto** das canônicas territoriais para evitar duplicate content penalty. Auditar conteúdo no PR A (parte do snapshot).

### 1.6. Detalhe do veículo

| Rota | Função | Indexável | Canonical | Aliases | Redirects | Removível |
|---|---|---|---|---|---|---|
| `/veiculo/[slug]` | Detalhe canônico | ✓ | self | — | — | ❌ Nunca |
| `/anuncios/[identifier]` | Redirect legado | ✗ | — | — | → `/veiculo/[slug]` | Confirmar e remover no PR I |

### 1.7. Conteúdo / iscas digitais

| Rota | Função | Indexável | Canonical | Removível |
|---|---|---|---|---|
| `/blog` | Blog index | ✓ | self | ❌ Nunca |
| `/blog/[cidade]` | Blog regional | ✓ | self | ❌ Nunca |
| `/tabela-fipe` | FIPE root | ✓ | self | ❌ Nunca |
| `/tabela-fipe/[cidade]` | FIPE regional | ✓ | self | ❌ Nunca |
| `/simulador-financiamento` | Simulador root | ✓ | self | ❌ Nunca |
| `/simulador-financiamento/[cidade]` | Simulador regional | ✓ | self | ❌ Nunca |
| `/planos` | Planos | ✓ | self | ❌ Nunca |

### 1.8. Institucionais

| Rota | Indexável | Removível |
|---|---|---|
| `/sobre` | ✓ | ❌ Nunca |
| `/como-funciona` | ✓ | ❌ Nunca |
| `/contato` | ✓ | ❌ Nunca |
| `/ajuda` | ✓ | ❌ Nunca |
| `/seguranca` | ✓ | ❌ Nunca |
| `/politica-de-privacidade` | ✓ | ❌ Nunca |
| `/termos-de-uso` | ✓ | ❌ Nunca |
| `/lgpd` | ✓ | ❌ Nunca |

### 1.9. Autenticação

| Rota | Indexável | Canonical | Removível |
|---|---|---|---|
| `/login` | ✓ | self | ❌ Nunca |
| `/cadastro` | ✓ | self | ❌ Nunca |
| `/recuperar-senha` | ✓ | self | ❌ Nunca |
| `/favoritos` | ⚠️ (depende de logado) | self | ❌ Nunca |

### 1.10. Fluxo de anúncio

| Rota | Função | Indexável | Removível |
|---|---|---|---|
| `/anunciar` | Landing | ✓ | ❌ Nunca |
| `/anunciar/novo` | Wizard oficial (force-dynamic) | ✗ (privada) | ❌ Nunca |
| `/anunciar/publicar` | ⚠️ Auditar — pode ser redundante | ✗ | ⚠️ **Verificar no PR A** |
| `/painel/anuncios/novo` | Redirect legado | ✗ | ✅ **Pode remover no PR C** após confirmar redirect coberto pelo middleware |

### 1.11. Painel / Dashboards

| Rota | Função | Indexável | Removível |
|---|---|---|---|
| `/dashboard` (PF) | Painel PF | ✗ | ❌ Nunca (Trilha 2 decide unificação) |
| `/dashboard/conta`, `/meus-anuncios`, `/senha` | Sub-páginas | ✗ | ❌ Nunca |
| `/dashboard-loja` (lojista) | Painel lojista | ✗ | ❌ Nunca (Trilha 2 decide) |
| `/dashboard-loja/meus-anuncios`, `/mensagens`, `/plano` | Sub-páginas | ✗ | ❌ Nunca |
| `/painel/*` | Legado (1 redirect conhecido em `/painel/anuncios/novo`) | ✗ | Auditar no PR A |
| `/impulsionar/[adId]` | Boost de anúncio | ✗ | ❌ Nunca |
| `/pagamento/sucesso`, `/pagamento/erro` | Post-checkout | ✗ | ❌ Nunca |

### 1.12. Admin (Trilha 2)

| Rota | Indexável | Removível |
|---|---|---|
| `/admin/*` (8 páginas client-only) | ✗ | ❌ Nunca (Trilha 2 trata) |

### 1.13. Sitemaps e infra

| Rota | Função | Removível |
|---|---|---|
| `/sitemap.xml` | Index dos sitemaps | ❌ Nunca |
| `/sitemaps/core.xml`, `/cities.xml`, `/brands.xml`, `/models.xml`, `/content.xml`, `/below-fipe.xml`, `/opportunities.xml`, `/local-seo.xml` | Sitemaps temáticos | ❌ Nunca |
| `/sitemaps/regiao/[state].xml` | Sitemap por estado | ❌ Nunca |
| `/robots.ts` | Robots | ❌ Nunca |
| `/api/diag` | Healthcheck | Avaliar — pode mover para `/api/health` se PR de infra |

---

## 2. Relações críticas entre famílias de rotas

### 2.1. `/anuncios` ↔ `/comprar/*` ↔ `/cidade/*`

```
              ┌──────────────────────────┐
              │   /anuncios              │  ← canônica geral
              │   (PROJECT_RULES)        │
              └──────────────────────────┘
                          ▲
                          │ filtros via query string
                          │
              ┌──────────────────────────┐
   /comprar ─→│   redirect interno       │
              └──────────────────────────┘
                          │
                          ▼
              ┌──────────────────────────┐
              │   /cidade/{slug}         │  ← canônica territorial
              │   (PROJECT_RULES)        │
              └──────────────────────────┘
                          ▲
                          │ 301 (após PR J)
                          │
   /comprar/{slug}, /comprar/cidade/{slug}
```

**Plano de consolidação (PR J)**:
1. Adicionar 301 no `middleware.ts` para `/comprar/{slug}` → `/cidade/{slug}`.
2. Adicionar 301 para `/comprar/cidade/{slug}` → `/cidade/{slug}`.
3. Adicionar 301 para `/comprar` → `/anuncios` (entry point genérico).
4. Manter `/comprar/estado/[uf]` (PROJECT_RULES marca como canônica).
5. Snapshot automatizado confirma 301 antes de mergear.

### 2.2. `/cidade/{slug}` ↔ `/carros-em/{slug}`, `/carros-baratos-em/{slug}`, `/carros-automaticos-em/{slug}`

São rotas **distintas** com **conteúdo distinto** voltado a SEO de palavra-chave:

- `/cidade/atibaia-sp` — listagem completa de Atibaia.
- `/carros-em/atibaia-sp` — landing page com "carros em Atibaia" como foco textual.
- `/carros-baratos-em/atibaia-sp` — foco em "carros baratos em Atibaia".
- `/carros-automaticos-em/atibaia-sp` — foco em "carros automáticos em Atibaia".

**Regra**: cada uma tem `canonical="self"` e **conteúdo (texto, h1, descrição) diferenciado**. Se o conteúdo for igual a `/cidade/{slug}`, vira duplicate content e Google penaliza.

**Auditoria pendente** (em PR A, parte do snapshot): confirmar diferenciação de conteúdo nestas 3 famílias × ~120 cidades = ~360 páginas.

### 2.3. `/anuncios/[identifier]` → `/veiculo/[slug]`

Redirect legado existente. Ao fazer PR I (detalhe), confirmar:
- Redirect ainda está no código.
- Sitemaps não listam `/anuncios/[identifier]`.
- Search Console não acusa erro.

Após confirmação, **pode remover a rota** `/anuncios/[identifier]` (deixando só o redirect via middleware se ainda há tráfego).

---

## 3. Redirects ativos e necessários

### 3.1. Redirects já ativos em `frontend/middleware.ts`

```typescript
config.matcher = [
  "/carros-em-:slug",            // → /carros-em/:slug
  "/carros-baratos-em-:slug",    // → /carros-baratos-em/:slug
  "/carros-automaticos-em-:slug" // → /carros-automaticos-em/:slug
]
```

### 3.2. Redirects necessários (a adicionar)

| Origem | Destino | PR responsável |
|---|---|---|
| `/comprar` | `/anuncios` | PR J |
| `/comprar/{slug}` | `/cidade/{slug}` | PR J |
| `/comprar/cidade/{slug}` | `/cidade/{slug}` | PR J |
| `/painel/anuncios/novo` | `/anunciar/novo` | Já existe (confirmar — está em `app/painel/anuncios/novo/page.tsx`, não middleware) |

### 3.3. Redirects condicionais

Se `/anunciar/publicar` for confirmado redundante (auditoria PR A pendente):
- `/anunciar/publicar` → `/anunciar/novo`

### 3.4. Política de redirects históricos

**Antes de remover qualquer rota**:
1. Buscar nos logs do Render últimas 24h de tráfego.
2. Se >0 hits/dia → manter redirect 301 indefinidamente.
3. Se 0 hits por 30 dias → pode remover redirect.

---

## 4. Inventário de canonical URLs (auditoria pendente em PR B)

A ser preenchido pelo script `snapshot-public-routes.mjs` (PR B). Para cada URL pública:

```json
{
  "url": "/cidade/atibaia-sp",
  "canonical_html": "https://carrosnacidade.com/cidade/atibaia-sp",
  "canonical_expected": "https://carrosnacidade.com/cidade/atibaia-sp",
  "match": true
}
```

**Sample mínima** (snapshot inicial em PR A — manualmente, 10 URLs):

- `/`
- `/anuncios`
- `/cidade/atibaia-sp`
- `/cidade/atibaia-sp/marca/honda`
- `/cidade/atibaia-sp/marca/honda/modelo/civic`
- `/cidade/atibaia-sp/oportunidades`
- `/cidade/atibaia-sp/abaixo-da-fipe`
- `/veiculo/<um-slug-real>` (descobrir 1 slug ativo)
- `/comprar/cidade/atibaia-sp`
- `/carros-em/atibaia-sp`

**Regra**: PR A entrega snapshot manual destas 10. PR B entrega script para automatizar 30-50.

---

## 5. Páginas que NÃO podem ser removidas (lista consolidada)

Esta seção espelha §5 do diagnóstico — qualquer remoção exige aprovação explícita do owner.

1. `/`
2. `/veiculo/[slug]`
3. `/cidade/[slug]` + todas sub-rotas (5 padrões × ~5.500 cidades)
4. `/anuncios`
5. `/anuncios/[identifier]` (até confirmar zero tráfego)
6. `/comprar/estado/[uf]`
7. `/carros-em/[slug]`, `/carros-baratos-em/[slug]`, `/carros-automaticos-em/[slug]`
8. `/blog`, `/blog/[cidade]`
9. `/tabela-fipe`, `/tabela-fipe/[cidade]`
10. `/simulador-financiamento`, `/simulador-financiamento/[cidade]`
11. `/planos`, `/anunciar`, `/anunciar/novo`
12. Todas institucionais (8)
13. `/login`, `/cadastro`, `/recuperar-senha`, `/favoritos`
14. `/dashboard/*`, `/dashboard-loja/*`, `/admin/*`
15. `/sitemap.xml` + todos `/sitemaps/*.xml`
16. `/robots.ts`
17. Middleware `frontend/middleware.ts` — redirects ativos

---

## 6. Páginas REMOVÍVEIS (com checklist §13)

Lista de candidatas a remoção, em ordem decrescente de confiança:

| Rota | Confiança | Pré-requisito | PR |
|---|---|---|---|
| `/painel/anuncios/novo` | Alta (redirect puro confirmado) | Verificar middleware | PR C |
| `/anunciar/publicar` | Pendente auditoria | Auditar fluxo no PR A | PR C ou M |

---

## 7. Critérios de aprovação para mudanças neste mapa

Toda alteração deste mapa em qualquer PR exige:

- [ ] Justificativa registrada na descrição do PR
- [ ] Redirect 301 (se rota mudar/sair) adicionado em `middleware.ts`
- [ ] Snapshot automatizado de rotas antes/depois (§8.2 do diagnóstico)
- [ ] E2E spec confirmando 301 status quando aplicável
- [ ] Atualização do `sitemap.xml` correspondente
- [ ] Verificação manual em Search Console se a rota tinha tráfego significativo

---

**Fim do mapa de rotas canônicas.**
