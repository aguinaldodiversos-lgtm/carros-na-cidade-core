# PR B — Testes de proteção

| Campo | Valor |
|---|---|
| **Versão** | 1 |
| **Data** | 2026-04-24 |
| **Branch** | `claude/sad-elbakyan-8155e1` |
| **Status** | ✅ Entregue (zero código de produção alterado) |
| **Pré-requisito** | PR A mergeado |
| **Bloqueia** | PR C (remoção de órfãos) e todos PRs visuais |
| **Referência** | [DIAGNOSTICO_REDESIGN.md](./DIAGNOSTICO_REDESIGN.md) §14 PR B |

---

## 0. Por que existe

O redesign mexe em SEO, SSR, conteúdo HTML e páginas indexadas. Sem rede de proteção, regressões silenciosas custam tráfego orgânico em escala. Este PR introduz:

1. **Snapshot automatizado de rotas** — captura `canonical`, `<h1>`, JSON-LD, metadata de uma lista fixa de URLs. Compara antes/depois de cada PR visual.
2. **Guardrails de CI** — falham se desenvolvedor introduzir `fetch` cru em Server Component público ou novos imports de `services/`.
3. **Testes E2E SEO** — verificam canonical, JSON-LD/breadcrumb, sitemap em produção/staging.

Cada deliverable é **invocável standalone**, sem afetar comportamento da aplicação.

---

## 1. Arquivos entregues

### 1.1. Scripts (`frontend/scripts/`)

| Arquivo | Comando | Função |
|---|---|---|
| `snapshot-public-routes.mjs` | `npm run snapshot:public-routes` | Captura snapshot de 30+ URLs com metadata SEO |
| `snapshot-diff.mjs` | `npm run snapshot:diff` | Compara dois snapshots, classifica diffs |
| `lint-public-fetch.mjs` | `npm run lint:public-fetch` | Falha se houver `fetch` cru em Server Component público |
| `lint-services-imports.mjs` | `npm run lint:services-imports` | Falha em novos imports de `services/` (baseline-driven) |

### 1.2. Specs E2E (`frontend/e2e/`)

| Arquivo | Tag | Comando | Cobertura |
|---|---|---|---|
| `seo-canonical.spec.ts` | `@seo-canonical` | `npm run test:e2e:seo:canonical` | Canonical, h1 único, description, OG em 10 páginas públicas |
| `seo-jsonld.spec.ts` | `@seo-jsonld` | `npm run test:e2e:seo:jsonld` | BreadcrumbList em 4 territoriais; Article em blog; Product/Vehicle em detalhe (opt-in) |
| `seo-sitemap.spec.ts` | `@seo-sitemap` | `npm run test:e2e:seo:sitemap` | sitemap.xml index + 8 sitemaps temáticos + regional + robots.txt |

Comando combinado: `npm run test:e2e:seo` (roda os 3 acima).

### 1.3. Baselines (`frontend/tests/snapshots/`)

| Arquivo | Função |
|---|---|
| `services-imports-baseline.txt` | Lista atual de 35 imports de `services/`. Adições novas são bloqueadas pelo guardrail. |

### 1.4. Package.json scripts adicionados

```json
"test:e2e:seo": "playwright test --grep \"@seo-canonical|@seo-jsonld|@seo-sitemap\"",
"test:e2e:seo:canonical": "playwright test e2e/seo-canonical.spec.ts",
"test:e2e:seo:jsonld": "playwright test e2e/seo-jsonld.spec.ts",
"test:e2e:seo:sitemap": "playwright test e2e/seo-sitemap.spec.ts",
"snapshot:public-routes": "node ./scripts/snapshot-public-routes.mjs",
"snapshot:diff": "node ./scripts/snapshot-diff.mjs",
"lint:public-fetch": "node ./scripts/lint-public-fetch.mjs",
"lint:services-imports": "node ./scripts/lint-services-imports.mjs --baseline=tests/snapshots/services-imports-baseline.txt",
"lint:services-imports:strict": "node ./scripts/lint-services-imports.mjs --strict",
"lint:guardrails": "npm run lint:public-fetch && npm run lint:services-imports"
```

---

## 2. Como usar — Snapshot automatizado de rotas

### 2.1. Capturar baseline antes de um PR

```bash
cd frontend

# Contra prod
npm run snapshot:public-routes -- --base=https://carrosnacidade.com --label=before-PR-G

# Contra staging
npm run snapshot:public-routes -- --base=https://staging.carrosnacidade.com --label=before-PR-G

# Contra dev local (precisa npm run dev rodando)
npm run snapshot:public-routes -- --base=http://localhost:3000 --label=before-PR-G
```

Saída: `tests/snapshots/before-PR-G.json`.

### 2.2. Capturar depois do PR e comparar

```bash
npm run snapshot:public-routes -- --base=https://staging.carrosnacidade.com --label=after-PR-G

npm run snapshot:diff -- tests/snapshots/before-PR-G.json tests/snapshots/after-PR-G.json
```

Exit codes:
- `0` — sem diferenças bloqueantes (pode mergear)
- `1` — diferenças bloqueantes (não mergear sem corrigir)
- `2` — erro fatal (snapshot inválido, etc.)

### 2.3. Classificação de diffs

| Severidade | Critério | Ação |
|---|---|---|
| 🔴 Bloqueante | canonical mudou, status virou ≠ 200, h1_count ≠ 1, robots mudou, jsonld_types perdeu tipo, breadcrumb removido, redirect destino mudou | **Bloqueia merge** automaticamente |
| 🟡 Exige explicar | title/description/og_image mudaram, internal_links_count >10% variação | Exige justificativa na descrição do PR |
| 🔵 Informativo | html_size_bytes >5% variação, h1_count corrigido para 1, jsonld_types adicionado | Apenas informativo |

### 2.4. URLs cobertas

Por padrão, ~38 URLs incluindo:
- Home + listagem canônica + 3 cidades sample (`atibaia-sp`, `campinas-sp`, `sao-paulo-sp`)
- Territoriais profundidade 1, 2, 3 + oportunidades + abaixo-da-fipe
- Aliases `/comprar/*`, SEO de palavra-chave (`/carros-em/*`)
- Blog, FIPE, simulador, planos
- 8 institucionais
- 3 auth
- 9 sitemaps + robots.txt

Detalhe do veículo (`/veiculo/<slug>`) é **pulado por padrão** — definir `VEHICLE_SLUG_SAMPLE=<slug-real>` no env para incluir.

---

## 3. Como usar — Guardrails de CI

### 3.1. Lint: fetch cru em Server Component público

```bash
npm run lint:public-fetch
```

**Falha se** algum `frontend/app/**/page.tsx` (excluindo `/api`, `/admin`, `/dashboard*`, `/painel`, `/anunciar/novo`, `/impulsionar`, `/pagamento`, `*.test.tsx`) usar `fetch(...)` direto em vez de `ssrResilientFetch` ou wrapper equivalente.

**Por que importa**: cold start do backend pode levar 20-40s. `fetch` cru tem timeout default de 10s. Resultado: ISR falha silenciosa, página branca, perda de SEO.

**Como ignorar (raro, justificado)**:

```ts
// lint-public-fetch:allow next-line
const data = await fetch("https://api-publica-de-terceiro.com/x");
```

**Estado atual**: zero violações.

### 3.2. Lint: imports de `services/`

```bash
# Modo padrão (compara com baseline)
npm run lint:services-imports

# Modo strict (falha em qualquer import — usar após PR 0.4D)
npm run lint:services-imports:strict
```

**Comportamento**:

| Modo | Quando | Ação |
|---|---|---|
| Baseline | PR B → 0.4C | Falha apenas em **novos** imports, tolera os 35 existentes |
| Strict | Após 0.4D | Falha em **qualquer** import de `services/` — pasta deve estar vazia |

**Atualizar baseline** (após uma migração 0.4B/C/D):

```bash
node scripts/lint-services-imports.mjs \
  --baseline=tests/snapshots/services-imports-baseline.txt \
  --update-baseline
```

### 3.3. Comando agregado para CI

```bash
npm run lint:guardrails
```

Roda os 2 guardrails em sequência. Falha se qualquer um falhar. Adicionar ao GitHub Actions como gate de PR.

---

## 4. Como usar — Specs E2E SEO

### 4.1. Pré-requisitos

Servidor Next.js rodando localmente:

```bash
cd frontend
npm run dev  # http://localhost:3000
```

Ou apontar para staging via `BASE_URL=https://staging.carrosnacidade.com`.

### 4.2. Comandos

```bash
# Tudo
npm run test:e2e:seo

# Individual
npm run test:e2e:seo:canonical
npm run test:e2e:seo:jsonld
npm run test:e2e:seo:sitemap
```

### 4.3. Cobertura

**Canonical (10 URLs)**:
- `/`, `/anuncios`, `/sobre`, `/como-funciona`, `/blog`, `/tabela-fipe`, `/simulador-financiamento`, `/planos`, `/login`, `/cadastro`
- Asserts: canonical presente, h1 único, description 40-220 chars, og:title presente

**JSON-LD (6 URLs)**:
- 4 territoriais: `/cidade/atibaia-sp`, `/cidade/atibaia-sp/marca/honda`, `/cidade/atibaia-sp/oportunidades`, `/cidade/atibaia-sp/abaixo-da-fipe` — esperam BreadcrumbList
- `/blog`, `/blog/atibaia-sp` — esperam pelo menos 1 bloco JSON-LD
- `/veiculo/<slug>` — opt-in via `VEHICLE_SLUG_FOR_E2E`. Esperam BreadcrumbList + Product/Vehicle

**Sitemap (10 URLs)**:
- `/sitemap.xml` — index com referência aos 8 sitemaps temáticos
- 8 sitemaps temáticos: core, cities, brands, models, content, below-fipe, opportunities, local-seo
- `/sitemaps/regiao/sp.xml` — sample regional (aceita 200 ou 404, não 5xx)
- `/robots.txt` — 200, contém "sitemap"

---

## 5. Workflow de PR (recomendado)

Para qualquer PR que mexa em catálogo, cidade, redirects, SEO ou metadata:

```bash
# 1. Antes de fazer mudanças
cd frontend
npm run snapshot:public-routes -- --base=https://staging.carrosnacidade.com --label=before-${PR_ID}

# 2. Fazer alterações de código

# 3. Validar guardrails
npm run lint:guardrails

# 4. Build + typecheck
npm run build
npm run typecheck

# 5. Rodar specs E2E SEO
npm run test:e2e:seo

# 6. Smoke E2E
npm run test:e2e:smoke

# 7. Deploy staging, capturar snapshot depois
npm run snapshot:public-routes -- --base=https://staging.carrosnacidade.com --label=after-${PR_ID}

# 8. Comparar
npm run snapshot:diff -- \
  tests/snapshots/before-${PR_ID}.json \
  tests/snapshots/after-${PR_ID}.json

# 9. Anexar resultado do diff na descrição do PR
```

---

## 6. Itens não cobertos por este PR

Continuam pendentes ou ficam para outros PRs:

- **Bundle analyzer** (`@next/bundle-analyzer`) — não adicionado nesta entrega; instalar antes do PR D.
- **Lighthouse CI** — coleta de métricas vai no `baseline-metrics-2026-04-24.md` manualmente até CI configurado.
- **Teste de SSR timeout** (cold start simulado) — não trivial em E2E, fica como melhoria futura.
- **Teste de fluxo WhatsApp em detalhe** — coberto por `vehicle-detail-premium.spec.ts` no nível de UI; teste específico de conversão pode ser adicionado em PR I.
- **Reforço de `user-isolation-api.spec.ts`** — spec já existe e cobre o essencial; novos cenários podem ser adicionados conforme novas rotas autenticadas surgirem (Trilha 2).
- **Bateria de testes de imagem (IMG-1 a IMG-12)** — vai no PR E (criação do `<VehicleImage>`).
- **Integração CI no GitHub Actions** — adicionar steps em workflow após este PR ser revisado.

---

## 7. Critérios de aceitação do PR B

- [x] `scripts/snapshot-public-routes.mjs` criado e funcional
- [x] `scripts/snapshot-diff.mjs` criado e funcional
- [x] `scripts/lint-public-fetch.mjs` criado, passando atualmente (zero violações)
- [x] `scripts/lint-services-imports.mjs` criado com modos baseline e strict
- [x] Baseline `services-imports-baseline.txt` gerado (35 entradas existentes)
- [x] `e2e/seo-canonical.spec.ts` cobrindo 10 URLs públicas
- [x] `e2e/seo-jsonld.spec.ts` cobrindo territoriais + blog + detalhe (opt-in)
- [x] `e2e/seo-sitemap.spec.ts` cobrindo index + 8 sitemaps + regional + robots
- [x] `package.json` atualizado com 10 novos scripts
- [x] Documentação completa em `docs/PR-B-PROTECTIVE-TESTS.md`
- [ ] Testes E2E executados localmente em verde (depende de ambiente com `npm install` rodado)

---

## 8. Próximos passos

Com o PR B mergeado, a Fase 0 fica desbloqueada:

1. **PR C** — remover shell e órfãos confirmados (com checklist §13). Inclui imagens duplicadas em `public/images/` e `/painel/anuncios/novo`.
2. **PR 0.4B** — migrar `marketService`, `planService`, `planStore` para `lib/`. Pode rodar em paralelo com PR C.
3. **PR D** — design system aditivo. Bloqueado por PR A (já entregue).

Quando todos esses estiverem merged, partimos para **PR E** (`<VehicleImage>` com bateria de testes IMG-1 a IMG-12) e depois **PR F** (`<AdCard>` unificado).

---

**Fim da documentação do PR B.**
