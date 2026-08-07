# P0 — Eliminação do fail-open por `INTERNAL_API_TOKEN`

Data: 2026-08-07 · Branch: `codex/fix-seo-routing-and-indexation`
ADR: [`docs/architecture/gates-fail-safe-e-internal-api-token.md`](../docs/architecture/gates-fail-safe-e-internal-api-token.md)

---

## 1. O que estava errado

Duas causas independentes produziam o mesmo efeito: **uma falha de
infraestrutura criava página territorial pública**.

### 1.1 O token nunca foi autorização — e o gate exigia

Os cinco gates tinham:

```ts
if (!token) return { kind: "unavailable", reason: "missing-internal-api-token" };
```

O gate se recusava a fazer uma chamada que **teria funcionado**. Verificado por
requisição real contra o backend de produção:

```
sem token,      UA cnc-internal/1.0  → 200
token INVÁLIDO, UA cnc-internal/1.0  → 200
```

E no código do backend: `/api/public/cities/public-set` e `/api/ads/:id` não têm
middleware de auth, e `cnc-internal/1.0` **não está** na blocklist do
bot-blocker. O token serve só para pular o rate-limit por IP.

Como o Next inlina `process.env` no bundle do middleware em **tempo de build**,
bastava a variável faltar no ambiente de build para o invariante inteiro se
desligar — sem erro, sem log, sem sintoma.

### 1.2 "Não consegui verificar" era permissão

```ts
if (result.kind === "unavailable") return { kind: "pass-unavailable", reason };
```

Um gate precisa de **três** respostas. A terceira estava colapsada na primeira.

---

## 2. A correção

```
cidade comprovadamente sem anúncio ativo  → 404
cidade comprovadamente ativa              → segue
não consegui verificar, COM snapshot      → decide pelo snapshot
não consegui verificar, SEM snapshot      → 503 (Retry-After + noindex)
```

| Peça | Arquivo | Papel |
| --- | --- | --- |
| Leitura de env em runtime | `lib/middleware/gate-runtime-env.ts` | `process.env[nome]` não é inlinado; literal do build fica como fallback |
| Cofre do último estado bom | `lib/middleware/gate-snapshot.ts` | evita que blip vire 503; expira em 24h; nunca guarda falha |
| Gate de cidade/UF | `lib/middleware/city-existence-gate.ts` | token opcional; `stale`; `block-unavailable` |
| Gate de anúncio + alias | `lib/middleware/ad-detail-gate.ts` | snapshot por identificador (LRU 2000); alias 308 mesmo em `stale` |
| Gate de loja / blog | `dealer-gate.ts`, `blog-gate.ts` | mesma política |
| Resposta 503 | `middleware.ts` (`gateUnavailableResponse`) | `Retry-After`, `no-store`, `X-Robots-Tag: noindex` |

**Escopo além do pedido:** loja e blog não foram citados, mas tinham o mesmo
defeito e a mesma justificativa no comentário — *"a page mantém o `notFound()`
como defesa"*. Essa justificativa não se sustenta: no Next 14.2 esse
`notFound()` produz **soft-404 com HTTP 200**. A defesa era o problema.

---

## 3. Evidências HTTP

### 3.1 O teste decisivo — build **e** runtime SEM `INTERNAL_API_TOKEN`

Exatamente o cenário do incidente.

```
/carros-em/atibaia-sp                200                                    (tem estoque)
/carros-em/braganca-paulista-sp      404  blocked-no-active-ads  source: fresh   ← era 200
/carros-em/altaneira-ce              404  blocked-no-active-ads  source: fresh   ← era 200
/carros-em/xpto-zz                   404                                    (cidade inexistente)
/comprar/cidade/braganca-paulista-sp 404  blocked-no-active-ads  source: fresh
/tabela-fipe/braganca-paulista-sp    404  blocked-no-active-ads  source: fresh
/carros-usados/ce                    404  blocked-uf-no-active-ads
/carros-usados/sp                    200

/anuncios/<id-válido>                308  → /veiculo/<slug>                 ← era 200 + meta refresh
/anuncios/inexistente-999999         404  blocked-not-found                 ← era 200
```

`source: fresh` prova que a chamada **aconteceu e teve sucesso sem token** — não
é o snapshot mascarando o problema.

### 3.2 Backend inalcançável, sem snapshot → 503

Mesmo build, `BACKEND_API_URL` apontado em **runtime** para um host morto:

```
/carros-em/atibaia-sp        503  gate: city    reason: fetch-error  Retry-After: 60  noindex
/carros-em/braganca-...      503  gate: city    reason: fetch-error  Retry-After: 60  noindex
/carros-usados/sp            503  gate: uf      reason: fetch-error
/anuncios/qualquer           503  gate: ad      reason: fetch-error
/veiculo/qualquer            503  gate: ad      reason: fetch-error
/lojas/qualquer              503  gate: dealer  reason: fetch-error
```

Este teste prova **duas** coisas de uma vez. A segunda é sutil: o build tinha o
backend real embutido, e o gate reagiu ao valor passado em runtime. Ou seja, a
leitura dinâmica de env **funciona no sandbox Edge** — não é só um fallback
teórico.

### 3.3 Backend cai DEPOIS de confirmar → snapshot decide

Proxy killable entre o frontend e o backend real:

```
1) backend OK — popula o snapshot
   /carros-em/atibaia-sp              200
   /carros-em/braganca-paulista-sp    404  source: fresh

2) backend derrubado

3) mesmas URLs
   /carros-em/atibaia-sp              200                     (segue servindo)
   /carros-em/braganca-paulista-sp    404  source: snapshot   (regra mantida)
   /carros-em/altaneira-ce            404  source: snapshot
```

O snapshot **não relaxa a regra** — ele só evita que um blip vire 503. Cidade
ausente do conjunto continua 404.

### 3.4 `limit`

```
/carros-em/atibaia-sp?limit=50           308 → /carros-em/atibaia-sp
/carros-em/atibaia-sp?limit=50&page=2    308 → /carros-em/atibaia-sp?page=2
/carros-em/atibaia-sp?limit=10           200
/carros-em/atibaia-sp?limit=10&page=1    308 → /carros-em/atibaia-sp?limit=10
/carros-em/atibaia-sp?limit=10&page=2    200   canonical: /carros-em/atibaia-sp?page=2
/carros-em/atibaia-sp?page=2             200
```

Paginação servida em `?limit=10&page=2` — nenhum `limit` nos links:

```html
<a rel="prev" aria-label="Página anterior" href="/carros-em/atibaia-sp">
<a aria-label="Página 1" href="/carros-em/atibaia-sp">1</a>
<span aria-current="page">2</span>
<a aria-label="Página 3" href="/carros-em/atibaia-sp?page=3">3</a>
<a rel="next" aria-label="Próxima página" href="/carros-em/atibaia-sp?page=3">
```

O defeito era maior do que a URL de exemplo sugeria: `normalizeCityFilters`
sempre preenche `filters.limit` com o default, então **todo** href de paginação
e todo chip de marca saíam com `?limit=50`. A evidência da Fase 1 não mostrou
porque o teste forçava `?limit=10`.

---

## 4. Testes

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ sem warnings nem erros |
| `npx tsc --noEmit` | ✅ sem erros |
| `npm run build` (com e sem token) | ✅ ambos |
| `npx vitest run` (frontend) | **2589 passaram, 5 falharam** |

**Falhas novas: nenhuma.** As 5 são as mesmas pré-existentes da linha de base
(`app/seguranca/page.copy.test.ts` ×2, `app/carros-usados/regiao/[slug]/page.config.test.ts` ×3).

> Numa das execuções apareceu uma 6ª falha em
> `lib/painel/upload-draft-photos-direct-r2.test.ts`. Não reproduz: passa
> isolada, passa na execução só de `lib/`, e passou nas duas execuções
> seguintes da suíte completa. É *flake* de ordenação/paralelismo, anterior a
> esta mudança.

### Cenários cobertos (`lib/middleware/gate-fail-safe.test.ts`)

Os sete pedidos, mais os derivados:

| Cenário | Verdito travado |
| --- | --- |
| `atibaia-sp` (com estoque) | passa |
| `braganca-paulista-sp` (sem estoque) | 404 |
| cidade inexistente | 404, idêntico ao caso acima |
| **token ausente** | chamada acontece; vereditos inalterados |
| **token inválido** | idem; se o backend rejeitar (401/403), vira 503 |
| **backend indisponível, sem snapshot** | 503 para toda cidade, inclusive a que existe |
| **backend indisponível, com snapshot** | decide pelo snapshot, sem relaxar a regra |
| snapshot expirado | volta a 503 |
| 404 nunca vira snapshot | crawler não enche a memória |
| payload malformado nunca vira snapshot | — |

Mais: `?limit=10`, `?limit=10&page=1`, `?limit=10&page=2`, `?page=2` em
`lib/seo/query-policy.test.ts`, incluindo a trava de que **`limit` nunca faz a
página 2 canonicalizar para a página 1**.

E um teste de alcance (`canonical-redirects-reachability.test.ts`) que exige que
o middleware **trate** `block-unavailable` nos cinco gates — sem ele, alguém
reintroduz o fail-open e a suíte continua verde.

---

## 5. `INTERNAL_API_TOKEN` ainda é necessário no build?

**Não para correção. Preferível para desempenho.**

- **Correção:** não. Provado por build sem a variável (§3.1): os vereditos são
  idênticos. O gate consulta o endpoint público e decide.
- **Desempenho:** sem token válido, as chamadas dos gates contam contra o
  rate-limit por IP do backend. O custo é baixo (o conjunto de cidades é *uma*
  entrada de cache para o site inteiro, revalidada a cada 60s), mas em pico de
  crawler o gate de anúncio faz uma chamada por identificador novo.
- **Por que o build ainda pode inliná-lo:** `gate-runtime-env.ts` lê primeiro em
  runtime (`process.env[nome]`, não analisável estaticamente) e cai no literal
  do build como fallback. Cobre as duas formas de deploy. O §3.2 mostra o
  caminho de runtime funcionando de fato.

**Recomendação:** manter a variável no Render (build e runtime). A diferença é
que agora a ausência dela degrada **desempenho**, não **correção**.

**Segurança:** nada mudou de lugar. `INTERNAL_API_TOKEN` continua sem prefixo
`NEXT_PUBLIC_` (o Next o remove do bundle do cliente), nunca é logado, nunca vai
para header de resposta e nunca cruza para o browser. Os headers de diagnóstico
expostos carregam apenas `fresh`/`snapshot` e o motivo enumerado da falha.

---

## 6. Commits

| Hash | Mensagem |
| --- | --- |
| `8d602939` | fix(seo): make territorial gates fail-safe instead of fail-open |
| `8806adb9` | fix(seo): stop propagating the default limit in catalog URLs |

---

## 7. Riscos e trade-offs assumidos

1. **Cold start + backend fora = 503 na superfície territorial.** É o preço do
   fail-safe, e é deliberado: 503 é temporário e recuperável; página indevida
   indexada não é. O snapshot cobre o caso comum (blip com processo já quente).

2. **O snapshot é por processo.** Morre em restart/deploy e não é compartilhado
   entre instâncias do Render. Aceitável porque o pior caso é 503, nunca 200.
   Um snapshot compartilhado (Redis) seria a evolução natural se o 503 aparecer
   em volume.

3. **`GATE_SNAPSHOT_MAX_AGE_HOURS` default 24h.** Generoso de propósito: o
   conjunto de cidades muda em escala de semanas, e errar para o lado do 503
   também custa caro. Se a operação preferir ser mais conservadora, é uma env.

4. **`/veiculo/[slug]` agora também 503a** quando o gate não verifica. Antes
   fazia `pass-unavailable`, mas o que a página produzia nesse caso era
   soft-404 200 — status errado para um anúncio que não existe. O snapshot por
   identificador mantém funcionando todo anúncio visitado recentemente.

5. **As 5 falhas de teste pré-existentes** seguem abertas, sem relação com esta
   etapa.

---

## 8. Veredito

| Pergunta | Resposta |
| --- | --- |
| Ausência do token pode desligar o gate? | **Não.** O token deixou de ser condição; provado por build sem ele. |
| Indisponibilidade pode virar 200 territorial? | **Não.** `pass-unavailable` não existe mais em nenhum gate; teste de fonte impede que volte. |
| Existe fallback com último estado válido? | **Sim.** Verificado ao vivo, com backend derrubado no meio da sessão. |
| Sem estado confiável, qual a resposta? | **503** com `Retry-After` e `X-Robots-Tag: noindex`. |
| O alias `/anuncios/[identifier]` pode voltar a 200 + meta refresh? | **Não.** 308 real sem token no build; 503 quando não verificável. |
| A solução depende de Atibaia? | **Não.** Nenhum slug fixo; testes usam duas cidades e o backend real tem só uma ativa. |
| Segredo exposto? | **Não.** Sem `NEXT_PUBLIC_`, sem log, sem header de resposta. |
| `limit` default propaga em link SEO? | **Não.** Removido dos links e normalizado por 308. |
| `limit` pode fazer page 2 canonicalizar para page 1? | **Não.** Travado por teste. |

**Não houve deploy. Não houve merge.**
