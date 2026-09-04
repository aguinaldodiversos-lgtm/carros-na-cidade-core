# CI-0 — Estabilização do baseline de CI

**Branch:** `codex/ci-baseline-stabilization-2026-09-03`
**Base:** `origin/main` @ `190df7a59c3d6d091497d11a2307b222a222ea59`
**Data:** 2026-09-03/04
**Motivo:** o CI da PR #52 estava vermelho. Antes de julgar a PR, era preciso
saber o que era dela e o que já era da `main`.

---

## A. Baseline

### Estado inicial

|                      |                                                                             |
| -------------------- | --------------------------------------------------------------------------- |
| `origin/main`        | `190df7a59c3d6d091497d11a2307b222a222ea59` (não avançou durante a execução) |
| Branch da PR #52     | `bea15d000748e2784d796a42cf272111d0a86d30`, 4 à frente / 0 atrás            |
| Branch de trabalho   | `codex/ci-baseline-stabilization-2026-09-03`, criada de `main`              |
| Working tree inicial | limpo, exceto os 4 arquivos protegidos (untracked)                          |

### A descoberta que orientou tudo

Minha máquina roda `America/Sao_Paulo` (UTC−3); o runner `ubuntu-latest` roda
**UTC**, e o workflow não define `TZ`. Rodar a suíte localmente do jeito normal
**não reproduz o CI**.

Todo o baseline abaixo foi medido com `TZ=UTC`, na `main` limpa:

```
Test Files  4 failed | 221 passed (225)
     Tests  10 failed | 3526 passed (3536)
    Errors  12 errors
```

| Área                                                  | Baseline (main)         | Depois (branch)       |
| ----------------------------------------------------- | ----------------------- | --------------------- |
| `SaleRequestScheduling.test.tsx`                      | **FAIL** (4)            | PASS (37/37)          |
| `app/seguranca/page.copy.test.ts`                     | **FAIL** (2)            | PASS (14/14)          |
| `app/carros-usados/regiao/[slug]/page.config.test.ts` | **FAIL** (3)            | PASS (14/14)          |
| `upload-draft-photos-direct-r2.test.ts`               | **FAIL** (1)            | PASS — flake, ver J   |
| Erros não tratados (scrollIntoView)                   | **12**                  | **0**                 |
| `prettier --check .`                                  | **FAIL** (321 arquivos) | gate incremental PASS |
| ESLint backend                                        | **FAIL** (11 erros)     | PASS (0 erros)        |
| Integração (`ci:integration-ads`)                     | **FAIL** (6 de 14)      | PASS (14/14)          |

**Nenhuma dessas falhas vem da PR #52.** Todas foram reproduzidas na `main` em
checkout, nesta mesma máquina.

### Dois desvios entre o briefing e o que a máquina mostrou

O briefing descreveu o problema de integração como uma violação de
`users_plan_fk` no teste "prioridade comercial: Pro > Start > Free". Auditado:

- os `plan_id` do fixture (`cnpj-store-pro`, `cnpj-store-start`,
  `cnpj-free-store`, `cpf-free-essential`) **existem e estão ativos** no banco
  de teste — a FK nunca foi violada;
- o teste com esse nome não existe; o mais próximo é
  `ads-ranking-commercial-layers.integration.test.js:241`, e **o CI não o roda**
  (`ci:integration-ads` aponta só para `ads-pipeline`);
- a falha real do job era outra: `fieldErrors: { images: ["Required"] }`.

Registrado aqui porque a diferença importa: corrigir a FK teria sido corrigir um
problema que não existe, deixando o real de pé.

---

## B. Prettier

### Causa

`npm run format:check` é `prettier --check .` e reprovava **321 arquivos** —
dívida acumulada de antes de o Prettier entrar no projeto. Um gate que já está
vermelho não gateia: reprova toda PR, inclusive as que não encostaram naqueles
arquivos, e treina o time a ignorar o passo. Quando alguém de fato manda um
arquivo mal formatado, o sinal se perde entre os 321.

### Por que NÃO reformatamos o repositório

Seriam centenas de arquivos num commit que sepulta o `git blame` e torna
qualquer revisão impossível — e não corrigiria o problema de fundo, que é o
gate medir a coisa errada. A dívida continua registrada e visível em
`npm run format:check`, mantido para quitação em lote próprio.

### Solução

`scripts/prettier-changed.mjs` — sem dependência nova, usando o Prettier já
instalado. Resolve a base por evento:

| evento         | base                                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| `pull_request` | `git merge-base origin/<base> HEAD`                                                  |
| `push`         | `github.event.before`, com fallback para `HEAD~1` (branch nova traz `before` zerado) |
| local          | `--base`, senão `origin/main`, senão `HEAD~1`                                        |

**Merge-base e não a ponta do alvo**: comparar com a ponta acusaria arquivos que
a `main` mudou _depois_ que a branch saiu — arquivos que a PR não tocou.

Detalhes que não são cosméticos:

- `git diff -z` (NUL-separado): nome com espaço ou acento sai escapado no
  formato normal; NUL é o único jeito de ler o nome como ele é;
- `--diff-filter=ACMR`: arquivo **apagado** não pode ser formatado; renomeado
  entra porque o conteúdo no destino é novo para o gate;
- `prettier.getFileInfo` decide a elegibilidade — ele lê o `.prettierignore` e
  sabe se existe parser. **Nenhuma lista de extensão escrita à mão, nenhum
  diretório excluído para "ficar verde"**;
- zero arquivos elegíveis é **sucesso explícito**: uma PR só de `.png` não tem o
  que formatar.

`fetch-depth: 0` no checkout do job de backend — o padrão (1) não traz o commit
da base e o `merge-base` não resolveria. É o único job que precisa.

### Testes do gate incremental

Todos executados de verdade, com commits reais:

| Caso                                                             | Esperado       | Resultado                                 |
| ---------------------------------------------------------------- | -------------- | ----------------------------------------- |
| 1. legado fora do padrão, **não** alterado (`FilterSidebar.tsx`) | PASS           | ✅ EXIT=0, 3 elegíveis, os 321 nem entram |
| 2. arquivo elegível alterado e mal formatado                     | FAIL           | ✅ EXIT=1, aponta o arquivo               |
| 3. o mesmo arquivo, formatado                                    | PASS           | ✅ EXIT=0                                 |
| 4. commit contendo **apenas** `.png`                             | PASS explícito | ✅ EXIT=0, "0 elegíveis"                  |
| extra: nome de arquivo **com espaço**                            | PASS           | ✅ lido corretamente                      |
| extra: arquivo **renomeado** (filtro R)                          | PASS           | ✅ verificado no destino                  |

Nenhum arquivo artificial ficou no repositório — as branches de teste foram
apagadas e a árvore verificada.

---

## C. Timezone

### Causa raiz

As fixtures trazem instantes com offset explícito
(`2026-08-25T10:00:00-03:00`) e as asserções são literais: `"25/08 às 10:00"`.
Um literal desses **não é propriedade do instante** — é propriedade do instante
_mais_ o fuso de quem lê. O arquivo passava em UTC−3 e falhava no runner (UTC)
por exatamente 3 horas.

### Contrato funcional encontrado

Documentado no código de produção, `lib/sale-requests/inspection.ts:175-192`:

> `toLocaleString` sem `timeZone` formata no fuso de QUEM ESTÁ LENDO, que é
> exatamente o certo aqui: o proprietário em Manaus e a loja em Atibaia veem o
> MESMO instante, cada um no relógio da parede dele. Fixar `America/Sao_Paulo`
> seria a mesma adivinhação que o backend recusa a fazer, só que no cliente — e
> erraria em toda cidade fora do fuso de Brasília.

**A produção está certa.** O caso do briefing ("aplicação DEVE usar timezone do
usuário") é o que vale, e está escrito, não deduzido.

### Solução aplicada

A tentação era trocar `10:00` por `13:00` no teste. Isso teria transformado o
fuso do runner em contrato — o produto passaria a "definir" que a hora da
avaliação é a hora de Londres.

O que foi feito:

1. O teste **declara** o fuso de que fala (`process.env.TZ = "America/Sao_Paulo"`,
   restaurado no `afterAll`), com o porquê escrito no arquivo.
2. `lib/sale-requests/inspection.formatSlot.test.ts` (novo) prova o contrato:
   a mesma entrada em **America/Sao_Paulo (10:00), UTC (13:00) e America/Manaus
   (09:00)**, mais a asserção de que o **instante (epoch) é idêntico nos três** —
   só o rótulo muda. E a virada de dia: `23:30-03:00` é 25/08 em São Paulo e
   26/08 em UTC.

Sem esse segundo arquivo, a linha `process.env.TZ = ...` seria remendo. Com ele,
é decisão.

**Zero linhas de produção alteradas.**

### Verificação

`SaleRequestScheduling.test.tsx`: **37/37 em UTC, America/Sao_Paulo e
Asia/Tokyo** (UTC+9, escolhido por ser o extremo oposto).

### Efeito colateral registrado

Sob UTC, as asserções de **ausência** daquele arquivo
(`queryByText(/25\/08 às 14:00/)).not.toBeInTheDocument()`) passavam por
vacuidade: a tela mostrava "17:00", então "14:00" estava ausente com ou sem o
defeito que elas existem para pegar. Fixar o fuso as torna verdadeiras de novo.

---

## D. /seguranca

### Classificação: **TESTE OBSOLETO**

O teste procurava a redação literal de junho: o título "O que o Carros na Cidade
faz na moderação dos anúncios" e a frase "O que NÃO fazemos: consulta Detran,
vistoria física...".

Em **2026-07-05 o commit `b43cfe1d`** substituiu todo o corpo da página por texto
institucional novo e não atualizou o teste. Dois casos vermelhos desde então.

### Justificativa

Auditado o conteúdo atual, a página protege **mais** que a antiga. Os sete
invariantes exigidos, cada um com texto real:

| Invariante                          | Texto na página                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| portal de anúncios                  | "portal de divulgação de anúncios automotivos"                                               |
| não é parte da negociação           | "não significa que o Carros na Cidade se torna parte da negociação"                          |
| pode revisar/bloquear/moderar       | "Revisar anúncios / Remover conteúdos suspeitos / Bloquear usuários / Suspender publicações" |
| verificação ≠ garantia              | "não garante a procedência do anúncio"; "não representam garantia de procedência"            |
| revisão ≠ certificação              | "não garante a identidade plena dos usuários, não garante a existência do veículo"           |
| não substitui vistoria independente | "não substitui a análise individual"; "verificação independente"                             |
| partes responsáveis                 | "de exclusiva responsabilidade das partes envolvidas"                                        |

A antiga não mencionava identidade dos usuários nem existência do veículo. **Não
há regressão jurídica**; há teste medindo a coisa errada.

Amarrar proteção jurídica a uma string exata transforma toda reescrita de copy em
alarme falso — e alarme falso que toca há dois meses deixa de ser lido.

### O que o teste protege agora

Sete invariantes por **conceito** (cada um aceitando mais de uma redação) + lista
de promessas proibidas. **Nenhuma frase foi adicionada à página.**

### Prova de que não é vacuoso

Mutações aplicadas com verificação de que a substituição casou (sem isso, um
"teste de mutação" que não muda nada dá falso conforto):

| Mutação                                                | Resultado                                             |
| ------------------------------------------------------ | ----------------------------------------------------- |
| remover **as duas** declarações de procedência         | ✅ falha o caso certo                                 |
| remover a lista de moderação inteira                   | ✅ falha                                              |
| remover a Declaração final                             | ✅ falha 2 casos                                      |
| inserir "compra segura garantida"                      | ✅ falha                                              |
| remover **apenas uma** de duas declarações redundantes | ✅ **não** falha — e está certo: o conceito sobrevive |

Página restaurada e verificada (`git diff` vazio) após cada mutação.

---

## E. SEO regional

### Classificação: **TESTE OBSOLETO** — evidência no próprio código de produção

Os três testes esperavam que `REGIONAL_PAGE_INDEXABLE` e
`REGIONAL_PAGE_CANONICAL_SELF` mudassem `robots.index` e o canonical. O código
diz literalmente por que não mudam mais:

```js
// APOSENTADA (Onda 2 Fase 2a, 2026-07-05): a página de cidade `/carros-em/[slug]`
// com raio cobre a intenção regional. A rota de região deixa de ser entidade
// indexável concorrente: canonical SEMPRE aponta para `/carros-em/[cidade-base]`
// (independente de REGIONAL_PAGE_CANONICAL_SELF) e a página é noindex.
...
// APOSENTADA: nunca indexável (canonical → cidade).
const indexable = false;
```

Corroboração: o quarto caso do mesmo bloco
(`default → noindex + canonical para cidade-base`) **já passava** — ele descreve
o comportamento atual. As flags continuam existindo em `feature-flags.ts`; o que
foi aposentado é o efeito delas sobre a metadata.

### Confirmação de que nada de SEO mudou

- `git diff origin/main...HEAD` não contém **nenhum** arquivo de `src/`,
  `lib/seo/`, `lib/env/feature-flags.ts`, `middleware.ts` ou
  `app/carros-usados/regiao/[slug]/page.tsx`;
- os únicos arquivos tocados no diretório da rota regional são `*.test.ts`;
- indexação e canonical regionais **permanecem exatamente como estavam**.

### O que foi feito

Os obsoletos **não foram apagados** — virariam um buraco por onde a indexação
regional poderia voltar sem ninguém perceber. Foram substituídos por casos que
afirmam a **aposentadoria**, incluindo uma varredura das 4 combinações das duas
flags: nenhuma produz `index: true` nem move o canonical.

Se alguém precisar reativar a promoção regional, estes testes falham — que é
exatamente quando a decisão deve voltar à mesa com o runbook aberto.

---

## F. scrollIntoView

### Causa

`SaleRequestForm` rola até o primeiro campo pendente — comportamento correto de
produto. O jsdom não implementa `scrollIntoView` (jsdom#1695, aberto desde 2016),
então a chamada derrubava a suíte com `TypeError` e a run fechava com **12 erros
não tratados** que não descreviam defeito nenhum.

### Solução (ambiente de teste, não produção)

Stub em `frontend/vitest.setup.ts`, só quando a API está ausente.

A alternativa seria guardar cada chamada em produção com
`typeof el.scrollIntoView === "function"` — código morto no navegador, escrito só
para agradar o ambiente de teste, espalhado por todo componente que precise rolar
a tela. (`OpportunityGallery.tsx:143` já carrega uma dessas, com o comentário
explicando que é por causa do jsdom.) O lugar de compensar lacuna do jsdom é o
setup do jsdom.

`vi.fn()` e não no-op anônimo: um teste que precise provar "a tela rolou até o
campo" pode afirmar sobre as chamadas e limpá-las. E o `defineProperty` só roda
se a API não existir — se o jsdom implementá-la um dia, o real prevalece.

### Aceite

**0 erros de `scrollIntoView`** na suíte completa (era 12).

---

## G. users.plan / fixtures de integração

### Valores permitidos pelo banco

`users.plan_id` é `TEXT REFERENCES subscription_plans(id)`. Consultado no banco
de teste recriado do zero:

```
cnpj-evento-premium|f    cnpj-free-store|t     cnpj-store-pro|t
cnpj-store-start|t       cpf-free-essential|t  cpf-premium-highlight|f
```

**Todos os `plan_id` usados pelos fixtures existem e estão ativos.** A FK
`users.plan_id` não foi violada em momento nenhum — ver o desvio registrado em A.

### As fixtures que estavam erradas

**`ads-pipeline.integration.test.js`** (o arquivo que o CI roda — 6 de 14 casos):
`images` virou obrigatório no validador (`min(1)`, "Anúncio precisa de pelo menos
1 foto válida") e os dois payloads não passavam o campo →
`fieldErrors: { images: ["Required"] }`. A regra é de produto e continua valendo;
quem estava errado era o payload.

**`ads-ranking-commercial-layers.integration.test.js`** (fora do CI) — dois
fixtures desatualizados em cascata:

1. `advertisers` exige `city_id` e `slug` (NOT NULL, `slug` sem default) e o
   helper inseria só `user_id` e `name`;
2. `makeAd` montava a query com `$1..$6` e passava 5 valores — faltava o
   `city_id` ("bind message supplies 5 parameters, but prepared statement
   requires 6").

### Confirmação

**Nenhuma migration criada. Nenhuma constraint relaxada. Nenhum schema tocado.**
O diff em `tests/integration/` é de 22 linhas, todas em fixture.

Verificado com o banco **recriado do zero** (`62 applied`, não `62 skipped` — a
primeira execução usou um volume reaproveitado e teria mascarado o estado):
`ads-pipeline` **14/14**, ranking **6/6**.

---

## H. Resultado final

Frontend medido com `TZ=UTC` (condição do runner).

| Gate                               | Baseline (main)     | Resultado                                    |
| ---------------------------------- | ------------------- | -------------------------------------------- |
| Backend lint                       | **FAIL** (11 erros) | **PASS** (0 erros, 222 warnings)             |
| Backend tests                      | PASS                | **PASS** (222 files, 3621 passed, 1 skipped) |
| `audit:contract`                   | PASS                | **PASS**                                     |
| `audit:integrity`                  | PASS                | **PASS**                                     |
| `audit:clones`                     | PASS                | **PASS**                                     |
| Integration (`ci:integration-ads`) | **FAIL** (6/14)     | **PASS** (14/14)                             |
| Frontend lint                      | PASS                | **PASS**                                     |
| Frontend typecheck                 | PASS                | **PASS**                                     |
| Frontend tests                     | **FAIL** (10)       | **PASS** (226 files, 3554 passed)            |
| Frontend build                     | não chegava a rodar | **PASS** (`✓ Compiled successfully`)         |
| Prettier incremental               | **FAIL** (321)      | **PASS** (10 elegíveis, todos formatados)    |
| Unhandled Vitest errors            | **12**              | **0**                                        |
| Migrações criadas                  | 0 esperado          | **0**                                        |

---

## I. Arquivos alterados

**Gate de formatação**

- `.github/workflows/ci.yml` — `fetch-depth: 0` + passo incremental
- `package.json` — `format:check:changed`, `format:changed` (o `format:check` completo permanece)
- `scripts/prettier-changed.mjs` (novo)

**Ambiente de teste**

- `frontend/vitest.setup.ts` — polyfill de `scrollIntoView`
- `frontend/components/account/SaleRequestScheduling.test.tsx` — fuso declarado
- `frontend/lib/sale-requests/inspection.formatSlot.test.ts` (novo) — contrato de fuso

**Contratos obsoletos**

- `frontend/app/seguranca/page.copy.test.ts` — reescrito por conceito
- `frontend/app/carros-usados/regiao/[slug]/page.config.test.ts` — aposentadoria travada

**Fixtures de integração**

- `tests/integration/ads-pipeline.integration.test.js`
- `tests/integration/ads-ranking-commercial-layers.integration.test.js`

**ESLint do backend** (10 scripts, todos em `scripts/`)

- `audit/audit-production-ads-quality.mjs`, `audit/lib/detect-bad-slug.mjs`,
  `blog/adopt-legacy-blog-posts.mjs`, `build-region-memberships.mjs`,
  `explore-region-radius.mjs`, `lib/regional-page-validators.mjs`,
  `maintenance/cleanup-sao-paulo-duplicate.mjs`, `smoke-regional-page.mjs`,
  `smoke-regions.mjs`, `smoke/public-contract-smoke.mjs`

**Zero arquivos de `src/`. Zero arquivos de produção do frontend. Zero
migrations. Zero mudanças em SEO, canonical ou indexação.**

Os 4 arquivos protegidos seguem **untracked e fora de todos os commits**
(verificado com `git log --name-only` e `git ls-tree` por arquivo).

---

## J. Riscos e débitos remanescentes

1. **`prettier --check .` continua reprovando 321 arquivos.** Não foi tocado de
   propósito. O gate do CI não depende mais disso, mas a dívida existe e o
   comando continua disponível para quitá-la em lote próprio.

2. **222 warnings de ESLint no backend.** Não bloqueiam (o passo não usa
   `--max-warnings 0`). Fora do escopo desta fase.

3. **`ads-ranking-commercial-layers.integration.test.js` não roda no CI.**
   `ci:integration-ads` aponta apenas para `ads-pipeline`. O arquivo agora passa
   (6/6), mas ligá-lo ao workflow é decisão de escopo e **não foi feita aqui**.
   Enquanto não for, ele pode voltar a apodrecer sem sinal.

4. **`upload-draft-photos-direct-r2.test.ts` é flake de carga.** Falha com
   `Test timed out in 5000ms` (não asserção) quando há build ou servidor
   concorrente; **23/23 em isolamento**, e verde na suíte completa desta branch.
   Se reaparecer no CI, o caminho é subir o `testTimeout` daquele arquivo — não
   foi mexido porque não falhou em nenhuma execução limpa.

5. **`extractAdsCount` foi removido do smoke público** por não ter consumidor
   nenhum. Se contar anúncios no smoke era a intenção, ela **nunca foi ligada** —
   o helper existia sem chamador. Fica registrado como lacuna funcional, não
   como limpeza.

6. **O `fetch-depth: 0` só foi aplicado ao job de backend.** Se outro job passar
   a precisar de comparação com a base, precisará do mesmo ajuste.

7. **Não houve execução real do GitHub Actions.** Tudo aqui foi medido
   localmente, com `TZ=UTC` para reproduzir o runner e com banco recriado do
   zero. O veredito final depende do CI verde na PR desta branch.

---

## CI-0.1 — Project audit

O CI real da PR #53 passou em Backend e Integration, e no Frontend passou lint,
typecheck e os 3554 testes — parando no passo `Project audit`, com **8 erros**.
`Next.js build` e `E2E` ficaram como _skipped_ por consequência.

### Classificação dos 8 achados

Todos foram **reproduzidos primeiro na `main` limpa**, num worktree separado
(`git worktree add --detach`, sem tocar na branch). Os oito existem na `main`
exatamente iguais — **a CI-0 não introduziu nenhum**.

| Finding                         | main | CI-0 | Classificação      | Correção                    |
| ------------------------------- | ---- | ---- | ------------------ | --------------------------- |
| `vehicle-breadcrumbs` jsx-in-ts | FAIL | FAIL | **Falso positivo** | analisador (`looksLikeJsx`) |
| `AccountPanelShell` nested      | FAIL | FAIL | **Falso positivo** | analisador (`hasNestedTag`) |
| `AccountPlanCard` wrapped       | FAIL | FAIL | **Falso positivo** | analisador (`tagWraps…`)    |
| `AccountUserMenu` wrapped       | FAIL | FAIL | **Falso positivo** | analisador (`tagWraps…`)    |
| `CatalogPagination` nested      | FAIL | FAIL | **Falso positivo** | analisador (`hasNestedTag`) |
| `PromoBanner` nested            | FAIL | FAIL | **Falso positivo** | analisador (`hasNestedTag`) |
| `HomeAnnounceBanner` nested     | FAIL | FAIL | **Falso positivo** | analisador (`hasNestedTag`) |
| `HomeHero` nested               | FAIL | FAIL | **Falso positivo** | analisador (`hasNestedTag`) |

**Zero arquivos de produção alterados.**

### A causa raiz — uma só, para os oito

O analisador lia o arquivo como **texto cru**. Um `<Link>` escrito dentro de um
**comentário de documentação** contava como tag aberta.

Instrumentei a função original (`hasNestedNextLink`) para imprimir _onde_ ela
enxergava o aninhamento. Nos cinco arquivos, o "Link externo" acusado era uma
menção em comentário:

```
CatalogPagination.tsx
  ACUSOU: <Link da linha 20
          o ">" que ele achou está na linha 20:
          "* JavaScript. O clique continua sendo interceptado pelo `<Link>` do Ne"
          depois viu <Link na linha 132 antes de </Link> na linha 143
```

O mesmo em `AccountPanelShell.tsx:156`, `PromoBanner.tsx:21`,
`HomeAnnounceBanner.tsx:17` e `HomeHero.tsx:349`. E em
`vehicle-breadcrumbs.ts:20` — um arquivo de 47 linhas, sem uma linha de JSX, que
nem importa React: a menção a `` `<Link>` `` num JSDoc bastava.

A contagem de tags confirma: em `CatalogPagination.tsx` há **4** ocorrências de
`<Link` e **3** de `</Link>` — a quarta é a do comentário. O scanner abria escopo
nela e nunca o fechava.

A ironia vale registro: o projeto documenta bem os componentes, e era justamente
a documentação que disparava o alarme. **O detector punia a boa prática.**

Estruturalmente, as árvores estavam certas. `CatalogPagination` tem três `<Link>`
**irmãos**; `AccountUserMenu` (linha 302) é irmão do `<Link>` (303) dentro do
mesmo `<div>`; `AccountPlanCard` (376) está num `<div>` sem Link nenhum.

Dois defeitos menores da mesma função foram corrigidos junto, porque
apareceriam assim que o primeiro fosse resolvido: `<Link ... />` auto-fechado era
tratado como abertura, e o `>` de um `=>` em `onClick={(e) => …}` era confundido
com o fim da tag.

### A correção

`scripts/audit/lib/jsx-structure.mjs` — módulo novo, **zero dependência**, com
`stripNonCode` (remove comentários, strings e template literals preservando
offsets), um scanner de eventos de tag ciente de auto-fechamento e de `{…}` nos
atributos, e as três funções que o audit consome.

**Por que não um parser de verdade:** o job `frontend` roda `npm ci` só em
`frontend/` e depois executa `audit:project` a partir da raiz — onde não há
`node_modules`. `project-audit.mjs` importa apenas `node:fs` e `node:path`, e é
por isso que funciona. Importar `typescript` derrubaria o audit com
`MODULE_NOT_FOUND` no próprio CI que se quer consertar. Importar de
`frontend/node_modules` faria o audit se comportar de um jeito com as
dependências instaladas e de outro sem elas — o oposto de CI confiável.

As duas funções antigas (`hasNestedNextLink`, `nextLinkWrapsComponent`, 70
linhas) foram removidas: ficariam órfãs, e `scripts/` é lintado.

`looksLikeJsx` procura **os mesmos sinais de antes** (`return (<`, `<svg`,
`<div`, `<Link`) — a regra não ficou mais ampla nem mais permissiva. O que mudou
é que agora eles são procurados no **código**, não no texto do arquivo.

### O que NÃO foi feito

Nenhuma regra desligada, nenhum `ERROR` rebaixado a `WARN`, nenhum `|| true`,
nenhuma allowlist, nenhum arquivo ignorado, nenhum `exitCode` forçado. Nenhum
`*.test.*` excluído em bloco.

### Prova de que o detector não ficou cego

25 testes em `tests/audit/jsx-structure.test.js`, cobrindo os casos A–E pedidos.
E três mutações no repositório real, cada uma revertida em seguida:

| Mutação                                                  | audit    | resultado                 |
| -------------------------------------------------------- | -------- | ------------------------- |
| `<Link>` REAL dentro de `<Link>` em `PromoBanner`        | `exit 1` | `direct-nested-link` ✓    |
| `const x = <div>teste</div>` em `vehicle-breadcrumbs.ts` | `exit 1` | `jsx-in-ts` ✓             |
| `<AccountPlanCard>` embrulhado por `<Link>` de verdade   | `exit 1` | `wrapped-self-linking…` ✓ |

Uma quarta tentativa merece nota: a primeira mutação que escrevi inseriu o Link
aninhado **dentro do comentário** da linha 21 (o regex casou a menção antes da
tag real). O audit reportou 0 erros — e estava certo. O experimento falhou, o
detector não.

### Antes e depois

|                           | Erros | Avisos  | exit  |
| ------------------------- | ----- | ------- | ----- |
| `main` (worktree limpo)   | 8     | 98      | 1     |
| CI-0 antes desta correção | 8     | 101     | 1     |
| **CI-0.1**                | **0** | **101** | **0** |

Os avisos continuam não bloqueantes e **não foram tocados** — os ~101 de
`missing-frontend-route`, `env-key-not-declared` e afins são outro trabalho.

### Gates após a correção

| Gate                             | Resultado                              |
| -------------------------------- | -------------------------------------- |
| `audit:project`                  | **PASS — 0 erros, 101 avisos, exit 0** |
| Backend lint (`src` + `scripts`) | PASS — 0 erros, 222 warnings           |
| Prettier incremental             | PASS                                   |
| Testes do detector               | PASS — 25/25                           |

---

## Situação

7 commits em `codex/ci-baseline-stabilization-2026-09-03`, à frente de
`origin/main` (`190df7a5`).

| Commit     | Assunto                                                  |
| ---------- | -------------------------------------------------------- |
| `d068dfd3` | `ci:` gate de prettier incremental                       |
| `a56513c4` | `test:` polyfill de jsdom + fuso do agendamento          |
| `f79a8306` | `test:` contratos obsoletos de /seguranca e SEO regional |
| `11048296` | `test:` fixtures de integração                           |
| `daefe378` | `fix(scripts):` 11 erros de eslint do job de backend     |
| `06bcd7c8` | `docs:` este relatório                                   |
| (CI-0.1)   | `fix(ci):` falsos positivos do project audit             |

Branch pushada; a PR #53 está aberta. **Não foi feito merge nem deploy.**
