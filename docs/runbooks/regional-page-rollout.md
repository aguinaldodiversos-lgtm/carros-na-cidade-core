# Rollout da Página Regional — Carros na Cidade

> **Status:** plano. A Página Regional **ainda não existe**. Este runbook
> define como ativá-la no futuro sem indexação prematura, canonical errado
> nem sitemap indevido.
>
> **Documento vivo.** Atualizar quando a URL final for cravada, quando a
> flag for ligada em qualquer ambiente, e quando o critério de indexação
> for aprovado.

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

| Superfície | Escopo | Exemplo de URL atual |
|---|---|---|
| **Estadual** | UF inteira | _(não existe ainda; futura)_ |
| **Regional** | cidade-base + região aproximada (≤60 km) | _(não existe ainda; futura — este runbook)_ |
| **Cidade** | local apenas (1 cidade) | `/comprar/cidade/[slug]`, `/cidade/[slug]`, `/carros-em/[slug]` |
| **Busca livre** | escolha do visitante (qualquer combinação de filtros) | `/comprar?...` |

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

## 4. URL regional — não cravar antes da aprovação

A URL final **não está decidida** e deve ser aprovada antes de qualquer
indexação. Opções em discussão:

| Opção | URL | Quando preferir |
|---|---|---|
| **Recomendada** | `/carros-usados/regiao/[base-slug]` | Alinhada ao padrão semântico das outras superfícies (`/carros-em/`, `/carros-usados/...`). Mais autoexplicativa para CTR. |
| **Provisória** | `/regiao/[slug]` | Curta, neutra. Aceitável apenas se a recomendada for descartada por motivo de conflito de namespace. |

**Regra:** decidir a URL final **antes** de remover o `noindex` ou de
incluir a rota no sitemap. Trocar URL depois de indexada implica em 301
em massa — operação que este rollout existe justamente para evitar.

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

| Estado | Robots |
|---|---|
| Regional desabilitada (flag false) | `noindex, follow` se servida acidentalmente |
| Regional em staging (flag true) | `noindex, follow` |
| Regional em produção antes da aprovação SEO | `noindex, follow` |
| Regional aprovada para indexação | `index, follow` **se** cumprir critério de estoque/conteúdo |

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
3. **Rodar smoke de regiões:** `npm run smoke:regions` do laptop com o
   token; e `npx vitest run lib/regions/` no frontend (deve passar 37
   testes — 31 unitários + 6 smoke).
4. **Ligar `REGIONAL_PAGE_ENABLED=true` em staging.**
5. **Testar manualmente 3 cidades** (cobertura típica do PR-3 do projeto):
   - **Atibaia** (cidade-base com vizinhança densa).
   - **Bragança Paulista** (cidade-base com vizinhança intermediária).
   - **Mairiporã** ou outra cidade pequena (cidade-base com pouca
     vizinhança — testa o caminho com poucos members).
6. **Validar em cada cidade:**
   - `city_slugs[0]` é a cidade-base na query do `/api/ads/search` (DevTools → Network).
   - Anúncios da cidade-base aparecem **antes** dos das vizinhas dentro
     da mesma camada comercial (efeito de `baseCityBoostExpr`).
   - Não aparecem cidades de outra UF automaticamente.
   - **Layout não muda** vs. cidade isolada (header, footer, cards, grids).
   - Resposta inclui `<meta name="robots" content="noindex, follow">`.
   - Canonical conforme a fase atual (§5).
7. **Só depois de tudo acima, considerar produção.**
8. **Em produção, ligar primeiro sem sitemap e mantendo `noindex`** (Fase C).
9. **Validar Search Console e logs** por pelo menos 1 ciclo de re-crawl
   (~7 dias). Procurar: erros 5xx, picos de latência, páginas finas
   sinalizadas, cobertura cruzada com Páginas de Cidade.
10. **Só depois liberar indexação e sitemap** (Fase D, §5 e §7).

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

## 10. Próxima etapa recomendada

A próxima etapa técnica **não é** criar a Página Regional. É resolver
a duplicação SEO das **páginas territoriais existentes** antes de
adicionar uma nova superfície ao mix.

Rotas que precisam de auditoria de canonical / `noindex` / sitemap antes
de qualquer trabalho na Regional:

- `/comprar/cidade/[slug]`
- `/cidade/[slug]`
- `/carros-em/[slug]`
- `/cidade/[slug]/oportunidades`
- `/cidade/[slug]/abaixo-da-fipe`
- `/carros-baratos-em/[slug]`
- `/carros-automaticos-em/[slug]`

Plano sugerido para o próximo runbook:

1. Mapear o canonical atual de cada rota acima (via `curl -sI` em prod).
2. Decidir uma URL canônica única por intenção (uma por cidade, uma por
   "abaixo-da-fipe", etc.).
3. Definir `noindex, follow` nas variantes não-canônicas.
4. Atualizar `app/sitemap.ts` para emitir somente URLs canônicas.
5. Validar em Search Console por 1 ciclo de re-crawl.
6. Só então abrir o trabalho da Página Regional (com este runbook).
