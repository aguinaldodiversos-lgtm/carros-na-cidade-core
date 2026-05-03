# Auditoria Canonical/Noindex/Sitemap — Rotas Territoriais

> **Coletado em:** 2026-05-03 contra `https://www.carrosnacidade.com` (prod, Cloudflare).
> **Ferramenta:** `curl -sSIL` (status/headers) + `curl -sSL` (HTML) + extração via `grep -oiE`.
> **Cidade-amostra:** Atibaia (SP). 7 rotas territoriais + 8 sitemaps.
>
> Auditoria pura, sem tocar em código. Nenhum canonical/robots/sitemap é
> alterado neste documento — apenas descrito.

---

## 1. Veredito geral

**Sim, existe competição SEO entre páginas territoriais — mas atenuada por
um padrão misto de `noindex` que protege parcialmente o domínio:**

- **2 rotas competem ativamente pela mesma intenção** ("comprar carros em
  Atibaia"): `/comprar/cidade/atibaia-sp` e `/carros-em/atibaia-sp`. Ambas
  retornam `200`, ambas têm `<meta name="robots" content="index, follow">`,
  ambas declaram canonical próprio. Title quase idêntico ("Carros usados em
  Atibaia - SP" vs. "Carros em Atibaia - SP"). Nenhuma das duas linka rel=canonical
  para a outra.
- **3 rotas estão sob `noindex, follow`** (`/cidade/atibaia-sp`,
  `/cidade/atibaia-sp/oportunidades`, `/cidade/atibaia-sp/abaixo-da-fipe`).
  Boa proteção contra duplicação, mas convivem com canonical apontando para
  si mesmas — combinação subótima (canonical de página `noindex` é sinal
  contraditório para crawlers).
- **2 rotas vivem isoladas** (`/carros-baratos-em/atibaia-sp`,
  `/carros-automaticos-em/atibaia-sp`): `index, follow`, canonical próprio,
  sem rota concorrente declarando a mesma intenção.
- **6 dos 8 sitemaps territoriais estão VAZIOS** (`cities.xml`,
  `local-seo.xml`, `opportunities.xml`, `below-fipe.xml`, `brands.xml`,
  `models.xml` — todos retornam `<urlset></urlset>`). **Nenhuma rota
  territorial é declarada em sitemap.** Descoberta pelo Google depende
  apenas do crawl interno via links.
- **Bug colateral encontrado** (não é canonical, mas vale anotar):
  - `/comprar/cidade/atibaia-sp` declara canonical **com query string**
    (`?sort=recent&limit=50`). Atípico — canonical normalmente é a forma
    sem query. Sinal de que o builder de canonical está vazando o default
    da query.
  - Title duplica o sufixo da brand: `"... | Carros na Cidade | Carros na
    Cidade"` em 5 das 7 rotas. Provavelmente concatenação dupla no `<head>`.

---

## 2. Tabela de rotas auditadas

| # | Rota | HTTP | URL final | Redirect? | Canonical (HTML) | Robots (HTML) | Title | Diagnóstico |
|---|---|---|---|---|---|---|---|---|
| 1 | `/comprar/cidade/atibaia-sp` | 200 | mesma | não | `…/comprar/cidade/atibaia-sp?sort=recent&limit=50` ⚠️ | `index, follow` | "Carros usados em Atibaia - SP \| Comprar \| …" | **Compete com #3.** Canonical com query é atípico. |
| 2 | `/cidade/atibaia-sp` | 200 | mesma | não | `…/cidade/atibaia-sp` | **`noindex, follow`** | "Carros em Atibaia - SP \| Carros na Cidade \| Carros na Cidade" | Já protegida por noindex. Canonical próprio em página noindex = sinal contraditório (preferir omitir canonical OU canonicalizar para a versão indexável). |
| 3 | `/carros-em/atibaia-sp` | 200 | mesma | não | `…/carros-em/atibaia-sp` | `index, follow` | "Carros em Atibaia - SP — 4 anúncios \| …" | **Compete com #1.** Title menciona contagem de anúncios — bom para CTR, mas duplica intenção da #1. |
| 4 | `/cidade/atibaia-sp/oportunidades` | 200 | mesma | não | `…/cidade/atibaia-sp/oportunidades` | **`noindex, follow`** | "Oportunidades de carros em Atibaia - SP \| …" | Mesma intenção da #5 e #6. Já protegida por noindex. |
| 5 | `/cidade/atibaia-sp/abaixo-da-fipe` | 200 | mesma | não | `…/cidade/atibaia-sp/abaixo-da-fipe` | **`noindex, follow`** | "Carros abaixo da FIPE em Atibaia - SP \| …" | Mesma intenção da #4 e #6. Já protegida por noindex. |
| 6 | `/carros-baratos-em/atibaia-sp` | 200 | mesma | não | `…/carros-baratos-em/atibaia-sp` | `index, follow` | "Carros baratos em Atibaia - SP — 2 abaixo da FIPE \| …" | **Única indexável da intenção "barato/abaixo-da-fipe".** Sem competição direta. |
| 7 | `/carros-automaticos-em/atibaia-sp` | 200 | mesma | não | `…/carros-automaticos-em/atibaia-sp` | `index, follow` | "Carros automáticos em Atibaia - SP — 4 ofertas \| …" | Única na intenção "automáticos". Sem competição. |

Headers HTTP de todas as 7 rotas são uniformes:
`Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`,
`Server: cloudflare`. **Nenhum `X-Robots-Tag` em header HTTP** — toda
sinalização de robots está no HTML.

---

## 3. Evidências por rota

Comandos usados (idênticos para todas):

```bash
curl -sSIL --max-time 20 "https://www.carrosnacidade.com<rota>"  # status + headers
curl -sSL  --max-time 25 "https://www.carrosnacidade.com<rota>"  # HTML
grep -oiE '<link[^>]*rel="canonical"[^>]*>' <html>
grep -oiE '<meta[^>]*name="robots"[^>]*>'   <html>
grep -oiE '<title[^>]*>[^<]*</title>'       <html>
grep -oiE '<h1[^>]*>[^<]*</h1>'             <html>
```

### 3.1 `/comprar/cidade/atibaia-sp`

```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8

<link rel="canonical" href="https://www.carrosnacidade.com/comprar/cidade/atibaia-sp?sort=recent&amp;limit=50"/>
<meta name="robots" content="index, follow"/>
<title>Carros usados em Atibaia - SP | Comprar | Carros na Cidade</title>
<h1>  (não encontrado por grep simples — provavelmente em componente client-rendered)
```

### 3.2 `/cidade/atibaia-sp`

```
HTTP/1.1 200 OK

<link rel="canonical" href="https://www.carrosnacidade.com/cidade/atibaia-sp"/>
<meta name="robots" content="noindex, follow"/>
<title>Carros em Atibaia - SP | Carros na Cidade | Carros na Cidade</title>
<h1>Carros em Atibaia - SP | Carros na Cidade</h1>
```

### 3.3 `/carros-em/atibaia-sp`

```
HTTP/1.1 200 OK

<link rel="canonical" href="https://www.carrosnacidade.com/carros-em/atibaia-sp"/>
<meta name="robots" content="index, follow"/>
<title>Carros em Atibaia - SP — 4 anúncios | Carros na Cidade | Carros na Cidade</title>
<h1>Carros em Atibaia (SP)</h1>
```

### 3.4 `/cidade/atibaia-sp/oportunidades`

```
HTTP/1.1 200 OK

<link rel="canonical" href="https://www.carrosnacidade.com/cidade/atibaia-sp/oportunidades"/>
<meta name="robots" content="noindex, follow"/>
<title>Oportunidades de carros em Atibaia - SP | Carros na Cidade | Carros na Cidade</title>
<h1>Oportunidades de carros em Atibaia - SP | Carros na Cidade</h1>
```

### 3.5 `/cidade/atibaia-sp/abaixo-da-fipe`

```
HTTP/1.1 200 OK

<link rel="canonical" href="https://www.carrosnacidade.com/cidade/atibaia-sp/abaixo-da-fipe"/>
<meta name="robots" content="noindex, follow"/>
<title>Carros abaixo da FIPE em Atibaia - SP | Carros na Cidade | Carros na Cidade</title>
<h1>Carros abaixo da FIPE em Atibaia - SP | Carros na Cidade</h1>
```

### 3.6 `/carros-baratos-em/atibaia-sp`

```
HTTP/1.1 200 OK

<link rel="canonical" href="https://www.carrosnacidade.com/carros-baratos-em/atibaia-sp"/>
<meta name="robots" content="index, follow"/>
<title>Carros baratos em Atibaia - SP — 2 abaixo da FIPE | Carros na Cidade | Carros na Cidade</title>
<h1>Carros baratos em Atibaia — SP</h1>
```

### 3.7 `/carros-automaticos-em/atibaia-sp`

```
HTTP/1.1 200 OK

<link rel="canonical" href="https://www.carrosnacidade.com/carros-automaticos-em/atibaia-sp"/>
<meta name="robots" content="index, follow"/>
<title>Carros automáticos em Atibaia - SP — 4 ofertas | Carros na Cidade | Carros na Cidade</title>
<h1>Carros automáticos em Atibaia (SP)</h1>
```

---

## 4. Auditoria dos sitemaps

`/sitemap.xml` é um índice. Listou **8 sitemaps filhos**. Todos retornam
HTTP 200; o tamanho denuncia o estado:

| Sitemap | HTTP | Tamanho | URLs territoriais | Padrões duplicados | Diagnóstico |
|---|---|---|---|---|---|
| `/sitemap.xml` (índice) | 200 | 1116 B | — | — | OK. Aponta para 8 filhos. |
| `/sitemaps/core.xml` | 200 | 1221 B | 0 | 0 | Só rotas institucionais (`/`, `/anuncios`, `/comprar`, `/blog`, `/planos`, `/simulador-financiamento`, `/tabela-fipe`). Nenhuma cidade. |
| `/sitemaps/content.xml` | 200 | 21 822 B | 0 | 0 | Só posts de blog (`/blog/<cidade>-<uf>`). Não conta como rota territorial — é conteúdo editorial. |
| `/sitemaps/cities.xml` | 200 | **107 B** | **0** ⚠️ | — | **VAZIO.** `<urlset></urlset>` literal. Esperado conter páginas de cidade. |
| `/sitemaps/local-seo.xml` | 200 | **107 B** | **0** ⚠️ | — | **VAZIO.** Esperado conter `/carros-em/<slug>`, `/carros-baratos-em/<slug>`, `/carros-automaticos-em/<slug>`. |
| `/sitemaps/opportunities.xml` | 200 | **107 B** | **0** ⚠️ | — | **VAZIO.** Esperado conter `/cidade/<slug>/oportunidades`. |
| `/sitemaps/below-fipe.xml` | 200 | **107 B** | **0** ⚠️ | — | **VAZIO.** Esperado conter `/cidade/<slug>/abaixo-da-fipe`. |
| `/sitemaps/brands.xml` | 200 | **107 B** | 0 | — | **VAZIO.** Sem páginas de marca declaradas. |
| `/sitemaps/models.xml` | 200 | **107 B** | 0 | — | **VAZIO.** Sem páginas de modelo declaradas. |

**Implicação principal:** mesmo as 4 rotas indexáveis
(`/comprar/cidade/`, `/carros-em/`, `/carros-baratos-em/`,
`/carros-automaticos-em/`) **não estão sendo declaradas em sitemap**.
O Google só as descobre via crawl orgânico de links internos. Antes de
qualquer mudança de canonical, vale entender por que o pipeline de
geração de sitemap está produzindo XMLs vazios — pode ser `feature flag`
desligada, falha silenciosa no fetch dos slugs, ou pipeline ainda não
implementado.

---

## 5. Diagnóstico de duplicação por intenção

### 5.1 Intenção "comprar carros na cidade"

| Rota | Robots | Canonical | Título |
|---|---|---|---|
| `/comprar/cidade/atibaia-sp` | **index** | self (com `?sort&limit`) | "Carros usados em Atibaia - SP \| Comprar" |
| `/cidade/atibaia-sp` | noindex | self | "Carros em Atibaia - SP" |
| `/carros-em/atibaia-sp` | **index** | self | "Carros em Atibaia - SP — 4 anúncios" |

**Conflito real**: `/comprar/cidade/` e `/carros-em/` competem. Mesma
intenção ("ver carros à venda em Atibaia"), ambas indexáveis, ambas com
canonical próprio. O Google escolherá uma sozinho — risco de cannibalization
e diluição de PageRank entre as duas.

`/cidade/atibaia-sp` está protegida por `noindex`, mas o canonical próprio
em página noindex é sinal **contraditório** (boa prática: omitir o canonical
em páginas noindex OU apontá-lo para a versão indexável que representa a
mesma intenção).

### 5.2 Intenção "abaixo da FIPE / oportunidades"

| Rota | Robots | Canonical | Título |
|---|---|---|---|
| `/cidade/atibaia-sp/oportunidades` | noindex | self | "Oportunidades de carros em Atibaia - SP" |
| `/cidade/atibaia-sp/abaixo-da-fipe` | noindex | self | "Carros abaixo da FIPE em Atibaia - SP" |
| `/carros-baratos-em/atibaia-sp` | **index** | self | "Carros baratos em Atibaia - SP — 2 abaixo da FIPE" |

**Sem conflito ativo de indexação**: só `/carros-baratos-em/` está indexável,
e seu título inclusive cita "abaixo da FIPE". As duas variantes em
`/cidade/<slug>/...` estão sob noindex — boa proteção. Mesmo problema
estrutural da intenção 5.1: canonical próprio em página noindex.

### 5.3 Intenção "automáticos"

| Rota | Robots | Canonical | Título |
|---|---|---|---|
| `/carros-automaticos-em/atibaia-sp` | **index** | self | "Carros automáticos em Atibaia - SP — 4 ofertas" |

**Sem competição.** Única rota servindo essa intenção.

---

## 6. Recomendação de canonical único por intenção

> **Apenas proposta.** Não implementa. A decisão final deve passar pelo
> responsável SEO antes de qualquer alteração de código.

| Intenção | URL canônica recomendada | Variantes que devem canonicalizar para ela | Variantes que devem virar `noindex` (sem canonical próprio) | Sair do sitemap |
|---|---|---|---|---|
| Comprar / listar carros na cidade | **`/carros-em/[slug]`** (mais semântica, título mais informativo, já tem contagem de anúncios) | `/comprar/cidade/[slug]` (ajustar canonical para `/carros-em/[slug]`); `/cidade/[slug]` (ajustar canonical para `/carros-em/[slug]`, manter noindex) | nenhuma adicional | `/comprar/cidade/`, `/cidade/` (já fora — sitemaps vazios) |
| Oportunidades / abaixo da FIPE / baratos | **`/carros-baratos-em/[slug]`** (única indexável; título já cobre as 3 variações) | `/cidade/[slug]/oportunidades` (canonical → `/carros-baratos-em/[slug]`); `/cidade/[slug]/abaixo-da-fipe` (canonical → `/carros-baratos-em/[slug]`) | manter ambas em noindex | já estão fora |
| Automáticos | **`/carros-automaticos-em/[slug]`** (já é única) | nenhuma | nenhuma | manter fora até definição |

**Regra geral aplicada:** quando a página é `noindex`, o `<link rel="canonical">`
deve ou ser **omitido** ou apontar para a **versão indexável da mesma intenção**.
Canonical próprio em página noindex confunde crawlers e desperdiça crawl budget.

**Bug a corrigir junto:** o canonical de `/comprar/cidade/[slug]` está
vazando `?sort=recent&limit=50`. Independente da decisão de qual rota
fica canônica, o builder não deveria incluir parâmetros de ordenação/paginação
no canonical — isso quebra a unificação até dentro da própria URL.

---

## 7. Plano de transição em fases

> **Sem 301 nesta fase.** Redirects permanentes ficam para uma fase
> posterior, depois de observar a resposta dos crawlers à mudança de
> canonical/noindex.

### Fase 1 — Ajustar canonical/noindex (sem 301)

1. `/cidade/[slug]` (já noindex) → trocar canonical próprio por canonical apontando para `/carros-em/[slug]`.
2. `/cidade/[slug]/oportunidades` (já noindex) → canonical apontando para `/carros-baratos-em/[slug]`.
3. `/cidade/[slug]/abaixo-da-fipe` (já noindex) → canonical apontando para `/carros-baratos-em/[slug]`.
4. `/comprar/cidade/[slug]` (hoje index) → trocar canonical para `/carros-em/[slug]`. **Manter `index, follow` temporariamente** para evitar perda abrupta de tráfego — o canonical já consolida o sinal sem despublicar.
5. Corrigir bug do canonical com query string em `/comprar/cidade/[slug]`.
6. Corrigir title duplicado `"… | Carros na Cidade | Carros na Cidade"` (provavelmente concatenação dupla no template do `<head>`).

### Fase 2 — Sitemaps

7. Investigar **por que** os 6 sitemaps territoriais estão vazios. Antes de "incluir" qualquer coisa, confirmar que o pipeline de geração existe e está rodando.
8. Quando o pipeline estiver funcional, **declarar somente as URLs canônicas**: `/carros-em/<slug>`, `/carros-baratos-em/<slug>`, `/carros-automaticos-em/<slug>`. Nunca declarar variantes noindex.

### Fase 3 — Monitorar

9. Aguardar 1 ciclo de re-crawl (~7 dias). Acompanhar Search Console: cobertura, "URL alternativa com tag canonical adequada", páginas com `noindex` aparecendo no índice.
10. Validar logs de tráfego: queda em `/comprar/cidade/`, ganho em `/carros-em/` (esperado, já que canonical move sinal).

### Fase 4 — Redirects 301 (só se necessário)

11. **Só se** a Fase 3 confirmar que o Google consolidou os sinais via canonical, considerar trocar `/comprar/cidade/[slug]` e `/cidade/[slug]` por `301 → /carros-em/[slug]`. Antes disso, os canonicals fazem o trabalho sem custo de irreversibilidade.

---

## 8. O que NÃO alterar ainda

- ❌ **Não criar Página Regional.** O runbook
  [regional-page-rollout.md](./regional-page-rollout.md) §10 deixa claro:
  resolver duplicação atual **antes** de adicionar mais uma superfície.
- ❌ **Não alterar layout** no PR de canonical/noindex. Mistura preocupações.
- ❌ **Não alterar planos comerciais** no PR de canonical/noindex.
- ❌ **Não emitir 301** nesta etapa. Canonical resolve sem custo de
  irreversibilidade. 301 fica para Fase 4, condicional.
- ❌ **Não renomear URLs para `/carros-usados/...`** ainda. Renomeação
  de URL canônica é mudança independente; misturá-la com unificação
  de duplicatas duplica o risco.
- ❌ **Não mexer no sitemap antes de entender por que está vazio.**
  Adicionar URLs num pipeline quebrado pode mascarar a causa raiz.

---

## 9. Próximo prompt recomendado

> **Tarefa:** Implementar a Fase 1 (canonical + noindex) da auditoria
> [territorial-canonical-audit.md](./territorial-canonical-audit.md), em
> arquivos de `app/` e `lib/seo/` (ou equivalente). Mudanças:
>
> 1. Em `/cidade/[slug]/page.tsx`: trocar canonical próprio por canonical
>    apontando para `/carros-em/[slug]`. Manter `noindex, follow`.
> 2. Em `/cidade/[slug]/oportunidades/page.tsx`: canonical para
>    `/carros-baratos-em/[slug]`. Manter `noindex, follow`.
> 3. Em `/cidade/[slug]/abaixo-da-fipe/page.tsx`: canonical para
>    `/carros-baratos-em/[slug]`. Manter `noindex, follow`.
> 4. Em `/comprar/cidade/[slug]/page.tsx`: canonical para `/carros-em/[slug]`
>    (forma sem query string). Manter `index, follow` temporariamente.
> 5. Corrigir bug: canonical de `/comprar/cidade/[slug]` está vazando
>    `?sort=recent&limit=50` — remover query do canonical builder.
> 6. Corrigir title duplicado `"… | Carros na Cidade | Carros na Cidade"`.
>
> **Adicionar testes** que verificam: (a) o canonical emitido por cada
> rota corresponde ao esperado da tabela §6, (b) o robots meta corresponde
> à tabela §6. Usar testes server-side de geração de metadata (não E2E).
>
> **NÃO mexer:** sitemap (Fase 2 separada), 301s (Fase 4 condicional),
> layout, planos comerciais, ranking, backend, Página Regional. Sem
> renomeação de URL para `/carros-usados/...`.
>
> Antes de implementar: ler os geradores de metadata atuais
> (`app/cidade/[slug]/page.tsx`, etc.) e mapear de onde sai cada
> `<link rel="canonical">` para garantir que a mudança seja cirúrgica.
