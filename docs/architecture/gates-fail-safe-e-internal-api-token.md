# Gates de indexação: fail-safe e o papel do `INTERNAL_API_TOKEN`

Data: 2026-08-07 · Substitui a política de *fail-open* dos gates de middleware.

---

## 1. O incidente

Medido em build de produção local (2026-08-06). Dois builds do **mesmo código**,
diferindo apenas na presença de `INTERNAL_API_TOKEN` no ambiente de **build**:

| Build | `/carros-em/braganca-paulista-sp` (cidade sem anúncio ativo) |
| --- | --- |
| com a variável no build | **404** — correto |
| sem a variável no build | **200** — o gate não existia |

Exportar a variável ao **subir** o servidor não corrigia. O valor já tinha sido
congelado no bundle.

Um gate de indexação cujo comportamento depende de uma variável ter estado
presente no build é um gate que se desliga sozinho, sem erro, sem log, sem
sintoma — até o Google indexar o que não devia.

---

## 2. As duas causas

### 2.1 O token nunca foi autorização

Os cinco gates tinham a forma:

```ts
if (!token) return { kind: "unavailable", reason: "missing-internal-api-token" };
```

O gate se recusava a fazer uma chamada que **teria funcionado**. Verificado nos
dois lados:

**No código do backend** — `/api/public/cities/public-set`, `/api/ads/:id` e as
demais rotas usadas pelos gates não têm middleware de autenticação. O
bot-blocker (`src/shared/middlewares/bot-blocker.middleware.js`) só bloqueia
quando `BAD_BOTS_BLOCKED=true` **e** o User-Agent casa com `BAD_BOT_UA_PATTERN`
— e `cnc-internal/1.0` **não está** nessa lista.

**Por requisição real contra produção:**

```
sem token,     UA cnc-internal/1.0  → 200
token INVÁLIDO, UA cnc-internal/1.0 → 200
```

O token serve a **uma** coisa: `isAuthenticatedInternalCall` faz a chamada pular
o rate-limit por IP (todos os edges do Render saem do mesmo IP). É otimização de
throughput, não porta de entrada.

### 2.2 "Não consegui verificar" era tratado como permissão

```ts
// antes
if (result.kind === "unavailable") return { kind: "pass-unavailable", reason };
```

Um gate precisa responder **três** perguntas, e a terceira estava colapsada na
primeira:

| pergunta | resposta correta |
| --- | --- |
| o recurso existe? | segue |
| o recurso não existe? | 404 |
| **não consegui verificar?** | **nunca 200** |

---

## 3. A política atual

```
cidade comprovadamente sem anúncio ativo  → 404
cidade comprovadamente ativa              → segue
não consegui verificar, COM snapshot      → decide pelo snapshot
não consegui verificar, SEM snapshot      → 503 (Retry-After + noindex)
```

Aplicada aos **cinco** gates: cidade, UF, anúncio, loja e blog.

Loja e blog não estavam no escopo do pedido, mas tinham o mesmo defeito e a
mesma justificativa no comentário — *"a page mantém o `notFound()` como defesa"*.
A justificativa não se sustenta: no Next 14.2 esse `notFound()` produz
**soft-404 com HTTP 200**. A "defesa em profundidade" era o problema.

### 3.1 O snapshot

`lib/middleware/gate-snapshot.ts`. É o que torna o fail-safe viável sem
fragilizar o site: um blip de rede continua sendo decidido com o último estado
**real** conhecido, em vez de virar 503.

Três propriedades importam:

- **Nunca relaxa a regra.** Cidade ausente do snapshot continua 404. O snapshot
  só evita o 503; ele não autoriza nada.
- **Só guarda resposta confirmada.** Payload malformado, 404, 5xx — nada disso
  vira snapshot. Cachear "não sei" como estado bom foi o defeito que congelou o
  sitemap vazio por semanas em 2026-07-27.
- **Expira.** Default 24h, ajustável por `GATE_SNAPSHOT_MAX_AGE_HOURS`. Em
  operação normal o conjunto se renova a cada 60s; um snapshot de dias não é
  "último estado bom", é palpite. O limite é generoso de propósito — errar para
  o lado do 503 também custa caro, e o conjunto de cidades muda em escala de
  semanas.

Para o gate de anúncio o cofre é por identificador, com teto de 2000 entradas
(LRU). O teto existe porque o espaço de identificadores é ilimitado: sem ele, um
crawler varrendo slugs inventados encheria a memória. Como 404 nunca vira
snapshot, slug inventado não ocupa espaço.

O snapshot é estado de módulo — morre em restart/deploy e não é compartilhado
entre instâncias. Isso é aceitável **porque o pior caso é 503, nunca 200**.

### 3.2 Por que 503 e não 404

404 afirma "este recurso não existe" — afirmação que, por definição, não podemos
fazer quando não conseguimos verificar. O Google trata 404 como remoção e 503
como "volte depois". Um 503 temporário é recuperável; um 404 indevido remove
páginas boas do índice, e um 200 indevido adiciona páginas ruins.

A resposta carrega `Retry-After: 60`, `Cache-Control: no-store` e
`X-Robots-Tag: noindex, nofollow`.

---

## 4. O `INTERNAL_API_TOKEN` ainda é necessário no build?

**Não para correção. Sim para desempenho — e mesmo assim, só como preferência.**

### 4.1 Para a correção do gate: não

Depois desta mudança, um build sem a variável produz exatamente o mesmo
comportamento de indexação de um build com ela. O gate consulta o endpoint
público, obtém a resposta e decide. Provado por build local sem a variável (ver
o relatório de evidências).

### 4.2 Para o rate-limit: preferível ter, em runtime

Sem token válido, as chamadas dos gates contam contra o rate-limit por IP do
backend. Na prática o custo é baixo — o conjunto de cidades é **uma** entrada de
cache para o site inteiro, revalidada a cada 60s — mas em pico de crawler o
gate de anúncio faz uma chamada por identificador novo.

### 4.3 Por que o build ainda pode inliná-lo

`lib/middleware/gate-runtime-env.ts` lê a variável em **duas** etapas:

```ts
const env = process.env as unknown as Record<string, string | undefined>;
return (env[key] ?? "").trim();          // dinâmico: o Next NÃO inlina
```

com o acesso estático (`process.env.INTERNAL_API_TOKEN`, que o Next inlina) como
**fallback**. Os dois caminhos juntos cobrem as duas formas de deploy:

- runtime que expõe `process.env` ao sandbox do middleware → pega em runtime,
  e a variável **não** precisa estar no build;
- runtime que não expõe → usa o literal do build, e aí ela precisa estar lá.

**Recomendação operacional:** manter `INTERNAL_API_TOKEN` no ambiente do Render
(build e runtime). Não porque o gate dependa disso — não depende mais — mas
porque o bypass de rate-limit é gratuito e útil. A diferença é que agora a
ausência da variável degrada **desempenho**, não **correção**.

### 4.4 Nenhum segredo mudou de lugar

- `INTERNAL_API_TOKEN` continua **sem** prefixo `NEXT_PUBLIC_`, então o Next
  segue removendo-o do bundle do cliente.
- O valor nunca é logado, nunca vai para header de resposta, nunca cruza para o
  browser. Só entra no header de uma chamada server→server.
- Os headers de diagnóstico expostos (`X-Middleware-City-Gate-Source`,
  `X-Middleware-Gate-Reason`) carregam apenas `fresh`/`snapshot` e o motivo
  enumerado da falha — nunca o token nem parte dele.

---

## 5. Observabilidade

| Header | Onde | Significado |
| --- | --- | --- |
| `X-Middleware-City-Gate-Source` | 404 territorial | `fresh` ou `snapshot` |
| `X-Middleware-Gate-Unavailable` | 503 | qual gate: `city`, `uf`, `ad`, `dealer`, `blog`, `city-regional` |
| `X-Middleware-Gate-Reason` | 503 | motivo enumerado |
| `x-cnc-city-gate-source` | request interno | `fresh`/`snapshot` para o SSR |

Toda degradação **loga** em stderr. Um gate que se degrada em silêncio é
indistinguível de um gate que funciona — foi exatamente assim que a dependência
de build passou despercebida.

`snapshot` aparecendo em volume significa backend fora: alguém precisa saber
**antes** de o snapshot expirar e a superfície virar 503.

---

## 6. O que fazer se o 503 aparecer em produção

1. Ver `X-Middleware-Gate-Reason` — ele diz se é timeout, 5xx, payload ruim ou
   ausência de `BACKEND_API_URL`.
2. `missing-backend-api-url` é config, não incidente: a variável sumiu do
   ambiente.
3. Qualquer outro motivo significa que o backend está inacessível a partir do
   Edge. O 503 é sintoma, não causa.
4. **Não** "corrija" reintroduzindo fail-open. Foi a tentativa de nunca mostrar
   erro que produziu páginas indexáveis indevidas.
