# Ficha preliminar de avaliação — "Enviar meu carro para as lojas"

**Data:** 2026-08-17
**Branch:** `claude/sale-request-professional-evaluation`
**Base:** `main` @ `d222e8c0` (merge da Fase 4.1)
**Commits:** 4 · **ahead 4 / behind 0**
**Veredito:** **GO DEFINITIVO** — release gate PostgreSQL executado e 100% verde (§16).

---

## 1. Diagnóstico do bug do CTA

**Sintoma relatado:** o proprietário preencheu o formulário inteiro, escolheu a
condição, viu "Curitiba" no campo de cidade e anexou nove fotos. O botão
"Enviar meu carro para as lojas" permaneceu desabilitado, sem mensagem, sem
campo destacado e sem nenhuma pista do motivo.

**Reproduzido.** Não foi presumido: montei dois harnesses de teste antes de
tocar em qualquer código de produção.

### Primeira tentativa — descartou a hipótese óbvia

Cenário exato do relato com o campo de cidade **mockado** (seleção garantida):
tudo preenchido, 9 fotos. O CTA **habilitou normalmente**. Isso eliminou
quantidade de fotos, cadeia FIPE, hidratação e estado de `submitting` como
causas.

### Segunda tentativa — reproduziu

Mesmo cenário com o componente de cidade **real**:

```
expect(screen.getByTestId("purchase-intent-city-input")).toHaveValue("Curitiba"); // ✓ passou
expect(screen.getByTestId("sale-request-submit")).toBeDisabled();                 // ✓ passou
expect(screen.queryByRole("alert")).toBeNull();                                   // ✓ passou
```

## 2. Causa raiz (comprovada)

`PurchaseIntentCityField` mantém o **texto digitado** no input quando a lista de
sugestões fecha sem escolha — e a lista fecha em **qualquer `mousedown` fora**
do componente ([PurchaseIntentCityField.tsx:153](frontend/components/account/PurchaseIntentCityField.tsx:153)).
Quem digita "Curitiba" e clica no campo seguinte fica com a cidade **escrita na
tela** e `city === null` no estado.

O gate anterior era um booleano agregado de doze termos, lido em **um único
lugar**: o `disabled` do botão.

```js
const canSubmit = Boolean(brandName) && … && Boolean(city) && photosOk && !submitting;
```

Ele *sabia* que `Boolean(city)` era falso e **não tinha como dizer isso a
ninguém**: a informação de qual termo falhou é destruída no mesmo `&&` que a
calcula. Esse é o defeito estrutural — a cidade foi só o gatilho mais provável.

### Segundo defeito do mesmo agregado (também provado)

```js
const mileageNumber = Number(String(mileage).replace(/\D/g, ""));
… Number.isFinite(mileageNumber) && mileageNumber >= 0 …
```

`Number("")` é `0`. **Quilometragem vazia passava no gate.** O envio era
liberado e o backend recusava com 400 — o pior dos dois mundos, porque a tela
tinha um teste de km e ele não testava nada. Provado por teste antes da
correção; hoje coberto em `evaluation.test.ts` ("campo VAZIO é incompleto").

## 3. Arquitetura escolhida

`buildValidationState(state)` — função **pura, sem React** — substitui o
booleano por uma estrutura que devolve o mesmo veredito **e a razão dele**:

```ts
{ sections[], missing[], missingSections[], completedSections, totalSections, progress, isComplete }
```

Fonte **única**, alimentando sem duplicação: CTA, erros inline, barra de
progresso, checklist do resumo, cartão "pronto para análise" e testes.

Estado mínimo no componente (`answers`, cadeia FIPE, cidade, fotos). Progresso,
seções completas, faltantes e completude são **derivados a cada render** — nada
disso é `useState`, porque uma segunda cópia da verdade é a que fica velha.

## 4–6. Migration, colunas, vocabulários

`054_sale_requests_vehicle_evaluation.sql` — **aditiva**. Não recria a tabela,
não toca 052/053, não remove nada. Confirmado que 053 era a última.

**20 colunas novas, todas NULLABLE e sem DEFAULT.** É a decisão central: um
`NOT NULL DEFAULT 'unknown'` preencheria as linhas antigas de uma vez e
destruiria a diferença entre **"a versão anterior não perguntou"** (NULL) e
**"a pessoa respondeu que não sabe"** (`'unknown'`). A obrigatoriedade vive na
aplicação, que exige resposta explícita para solicitações **novas**.

| Coluna | Tipo | Vocabulário |
|---|---|---|
| `tire_condition` | TEXT | `new` `good` `half_life` `replace_soon` `replace_now` `unknown` |
| `financing_status` / `fines_status` / `auction_history` / `collision_history` | TEXT | `yes` `no` `unknown` |
| `financing_balance` / `fines_amount` / `ipva_amount_due` | NUMERIC(14,2) | ≥ 0 |
| `ipva_status` | TEXT | `paid` `installments` `open` `unknown` |
| `licensing_status` | TEXT | `ok` `pending` `unknown` |
| `caution_report_status` | TEXT | `not_available` `approved` `approved_with_notes` `rejected` `unknown` |
| `engine/gearbox/suspension_condition` | TEXT | `ok` `issue` `unknown` |
| `engine/gearbox/suspension_notes` | TEXT | livre, máx. 500 |
| `body_paint_status` | TEXT | `issues` `none` `unknown` |
| `body_paint_issues` | JSONB (array) | `scratches` `dents` `worn_paint` `repainted_parts` `collision_repair` |
| `body_paint_notes` | TEXT | livre, máx. 500 |

**Três estados, nunca boolean:** reduzir "não sei" a `false` seria transformá-lo
numa afirmação com valor comercial. "Este carro NÃO tem financiamento" é
diferente de "o dono não sabe", e a diferença aparece no primeiro lance.

**Laudo cautelar é UMA coluna**, não o par (possui, resultado). Duas colunas
independentes permitem o estado impossível "não possui laudo + aprovado", e
seriam dois CHECKs que não se enxergam. Um vocabulário único torna esse estado
**inexprimível** em vez de apenas proibido. Na tela continuam sendo duas
perguntas; `resolveCautionReportStatus` faz a junção e só lê o resultado no ramo
`yes`.

`body_paint_issues` é JSONB seguindo a convenção que a 037 estabeleceu
(`ads.vehicle_options`), com índice GIN — a 4.2 vai filtrar por tipo de avaria.

## 7. Validações condicionais

Impostas nas **três** camadas (tela → validador → CHECK):

| Regra | Comportamento |
|---|---|
| `financing_status ≠ yes` | `financing_balance` → NULL |
| `fines_status ≠ yes` | `fines_amount` → NULL |
| `ipva_status ∈ {paid, unknown}` | `ipva_amount_due` → NULL |
| `*_condition = issue` | `*_notes` **exigido** |
| `*_condition ≠ issue` | `*_notes` → NULL |
| `body_paint_status = issues` | ≥ 1 detalhe **exigido** |
| `body_paint_status ∈ {none, unknown}` | zero detalhes, notas → NULL |

Valor abandonado vira **NULL, não erro**: quem responde "não tenho
financiamento" com um saldo antigo ainda no estado não cometeu falta — mudou de
ideia. Punir isso seria punir uma correção legítima.

No banco, a lataria é uma **bicondicional**:
`(status = 'issues') = (issues IS NOT NULL AND issues <> '[]')`, que barra as
duas contradições possíveis num CHECK só. A forma usa comparação, e não
`jsonb_array_length` — ver §16.1(b) para o defeito que a versão anterior
escondia.

E os ELEMENTOS do array têm allowlist no próprio banco
(`sale_requests_body_paint_issues_allowed_check`), não só no validador — §16.1(a).

## 8–9. Arquivos e componentes

**Backend (5):** migration 054, `constants.js`, `validation.js` (+`validateEvaluation`,
`validateMoney`, `validateMechanicalPart`, `validateBodyPaint`), `repository.js`,
`service.js`.

**Frontend novos (9):** `lib/sale-requests/evaluation.ts`,
`SaleRequestSectionCard`, `SaleRequestChoiceGroup` (+`CheckboxGroup`),
`SaleRequestFields` (`MoneyField`, `NotesField`), `SaleRequestFinancialSection`,
`SaleRequestHistorySection`, `SaleRequestMechanicsSection`,
`SaleRequestBodyPaintSection`, `SaleRequestSummary`.

**Frontend alterados (4):** `SaleRequestForm.tsx` (442 → 660 linhas, agora
orquestrador), `SaleRequestDetail.tsx`, `lib/sale-requests/api.ts`,
`vender-para-lojas/nova/page.tsx` (o `h1` migrou para o formulário porque o
cabeçalho carrega o progresso, que é derivado do estado da ficha).

`money` guarda **centavos** (dígitos), exibe em pt-BR e envia decimal com ponto.
O backend recusa `"18.500,00"` de propósito: num formato em que o ponto é milhar
num lugar e decimal noutro, `"1.500"` é ambíguo — e adivinhar errado num saldo
devedor é um erro caro.

## 10–11. Uso da referência `vender-para-loja.png`

Arquivo **não tracked antes e depois** — não foi commitado, modificado, movido
nem embutido no bundle. Serviu só como referência de layout.

**Reproduzido:** estrutura de duas colunas com resumo sticky; cartões numerados
com ícone em quadrado azul-claro; progresso no cabeçalho; resumo com foto real,
specs, agrupamentos (pendências / histórico / mecânica), cartão verde "Pronto
para análise", CTA azul e checklist com progresso; paleta branco / azul
institucional / cinza claro; verde só para concluído, vermelho só para erro.

**Adaptado:** ícones são SVG inline (o projeto não tem biblioteca de ícones, e
trazer uma para oito glifos de 16px seria caro); o resumo é uma coluna de
cartões empilhados em vez de um bloco único, para o CTA ficar acima da dobra.

**Deliberadamente NÃO reproduzido:**

- **"Até 20 fotos"** → o limite do produto é **12**. A imagem é ilustrativa; a
  regra não muda sem decisão explícita.
- **Header e sidebar** → a página usa o shell existente. Nenhum menu duplicado.
- **"Suas informações estão seguras e serão compartilhadas apenas com lojas
  parceiras"** → **removido**. A plataforma não sustenta essa afirmação hoje: o
  bucket R2 é servido publicamente e a URL de uma foto vale para sempre (risco
  R-1 da Fase 4.0). Copy que promete o que o sistema não cumpre é pior que copy
  nenhuma.
- **"8 de 9 etapas"** → são **8** seções essenciais; observações adicionais são
  opcionais e não entram na contagem, senão a barra nunca chegaria a 100%.

## 12. Screenshots

**Não geradas.** O painel do navegador não estava disponível nesta sessão
(`Screenshot timed out: the Browser pane is not displayed`). As medições abaixo
foram feitas por `javascript_tool` no mesmo navegador, e a verificação funcional
do CTA foi executada no browser real. Screenshots ficam como item manual.

## 13–14. Responsividade — `scrollWidth` × `clientWidth`

Medido num harness temporário (`/zz-ficha-preview`, **removido**, não commitado)
que monta os componentes reais com dados falsos.

| Largura | Ficha `scrollWidth`/`clientWidth` | Detalhe `scrollWidth`/`clientWidth` | OK |
|---|---|---|---|
| 360 | 360 / 360 | 360 / 360 | ✅ |
| 390 | 390 / 390 | 390 / 390 | ✅ |
| 412 | 412 / 412 | 412 / 412 | ✅ |
| 768 | 753 / 753 | 753 / 753 | ✅ |
| 1024 | 1009 / 1009 | 1009 / 1009 | ✅ |
| 1440 | 1425 / 1425 | 1425 / 1425 | ✅ |

**Zero overflow horizontal em qualquer largura**, e zero elementos ultrapassando
a largura do documento.

Desktop 1440: grade `904px 320px` = **74% / 26%**, resumo `position: sticky`.
Em 1024: `640.8px 320px`, também sticky. Abaixo de `lg`, uma coluna e o resumo
vira bloco normal no fim do fluxo.

`minmax(0, 1fr)` na coluna principal é o que garante isso: uma trilha `1fr` tem
largura mínima automática e um filho largo empurraria a grade inteira.

**CTA sticky no mobile: não implementado.** O resumo já entrega o CTA logo após
a última seção; uma barra fixa cobriria campos e duplicaria o botão sem ganho
claro.

## 15. Verificação funcional no navegador real

Com o formulário vazio, no Chromium:

```
disabled: false
click → "Revise 21 informações antes de enviar: Marca, Modelo e versão, Ano e Quilometragem, e mais 17."
foco: sale-request-brand
campos com aria-invalid: 50
selos de seção: 8× "Falta responder"
```

Detalhe renderizando a ficha inteira, incluindo `Financiamento ativo: Sim
(R$ 18.500,00)`, `IPVA: Parcelado (R$ 450,50)`, `Câmbio: Possui problema` com a
descrição, e `Detalhes: Riscos, Amassados`.

## 16. PostgreSQL — **RELEASE GATE EXECUTADO, 100% VERDE**

Docker Desktop 29.7.2 + `carros-postgres-test` (PostgreSQL em `127.0.0.1:5433`).
As duas pendências da revisão anterior estão **fechadas**.

### 16.1 Hardening da 054 aplicado ANTES do gate

**(a) Allowlist dos ELEMENTOS de `body_paint_issues`.** Antes, a migration
garantia apenas que a coluna fosse um array JSONB e que a cardinalidade batesse
com `body_paint_status`. Os elementos em si só eram validados pela aplicação —
`body_paint_issues` era a **única coluna de vocabulário fechado da tabela sem
allowlist no banco**, e qualquer caminho fora do HTTP (script, psql, módulo
futuro) gravava `["banana"]` sem obstáculo.

Novo CHECK, na **própria 054** (ainda não aplicada em produção, então sem 055):

```sql
CONSTRAINT sale_requests_body_paint_issues_allowed_check
CHECK (
  body_paint_issues IS NULL
  OR body_paint_issues <@ '["scratches","dents","worn_paint","repainted_parts","collision_repair"]'::jsonb
)
```

Usa o operador de **contenção** e não um `NOT EXISTS` sobre
`jsonb_array_elements_text` porque **PostgreSQL proíbe subconsulta dentro de
CHECK**. `a <@ b` é verdadeiro quando todo elemento de `a` está em `b` — sem
subconsulta, sem função nova, e indexável pelo GIN que já existe.

Preserva os três estados exigidos: `NULL` (legado) passa pelo primeiro ramo,
`[]` está contido em qualquer conjunto, e array não vazio precisa estar todo
dentro do catálogo.

**(b) DEFEITO ENCONTRADO PELO PRÓPRIO GATE — e corrigido dentro da 054.**

Ao rodar os testes novos, três falharam com **`cannot get array length of a
scalar`** em vez de violação de constraint. Diagnóstico: a bicondicional de
lataria usava `jsonb_array_length(body_paint_issues)`, e essa função **lança**
em qualquer valor não-array em vez de devolver NULL:

```
'["a"]'   -> len 1        '"riscos"' -> ERRO: cannot get array length of a scalar
'[]'      -> len 0        '{"a":1}'  -> ERRO: cannot get array length of a non-array
```

O PostgreSQL **não promete ordem de avaliação entre CHECKs da mesma tabela**.
Então um valor não-array podia bater primeiro na coerência e morrer como **erro
de tipo (SQLSTATE 22023)** em vez de **violação de constraint (23514)** — apesar
de existir, ao lado, um CHECK feito exatamente para recusá-lo com nome legível.

Não é cosmético: quem trata `23514` para virar mensagem de campo não reconhece
`22023`, e a mesma linha inválida vira **500 em vez de 400**; e o log não nomeia
constraint nenhuma, justamente no caso em que alguém escreveu direto no banco.

Correção: trocar a função que lança por uma **comparação**, que nunca lança:

```sql
(body_paint_status = 'issues')
  = (body_paint_issues IS NOT NULL AND body_paint_issues <> '[]'::jsonb)
```

Semântica idêntica para arrays (`[]` → sem detalhes; `["x"]` → com detalhes) e
NULL continua valendo zero detalhes. `jsonb_array_length` não aparece mais em
CHECK nenhum da migration. Teste de regressão dedicado assegura **SQLSTATE
23514** para as quatro combinações de valor não-array.

### 16.2 (A) Banco LIMPO — migrations 001..054

```
A) migrations aplicadas: 54 | ultima: 054_sale_requests_vehicle_evaluation
A) colunas da ficha presentes: 20/20
```

### 16.3 (B) Banco em 053 → aplicar 054

Cenário construído de verdade: a 054 foi **retirada do diretório**, o banco
migrado até a 053, uma **solicitação legada gravada nesse estado** (o dado que
existe em produção hoje), e só então a 054 foi restaurada e aplicada.

```
B) apos esconder a 054: 53 migrations | ultima: 053_sale_request_images
B) coluna tire_condition ANTES da 054: 0 (esperado 0)
B) linha legada gravada em 053: 1
B) migration 054 restaurada no working tree
B) apos aplicar a 054: 54 migrations | ultima: 054_sale_requests_vehicle_evaluation
B) linha legada apos upgrade: 1 linha(s), ficha NULL: 1, body_paint_issues NULL: 1
   gate_clean: CHECK de allowlist de elementos presente = 1
   gate_053:   CHECK de allowlist de elementos presente = 1
RELEASE GATE: OK nos dois cenarios.
```

**Zero perda de dado.** A linha escrita em 053 sobreviveu com a ficha inteira em
NULL — inclusive `body_paint_issues` em **NULL**, e não `[]`, preservando a
distinção entre "não foi perguntado" e "respondeu que não há detalhe".

### 16.4 (C) Migration 054 — 44 testes de schema

`sale-requests-schema.integration.test.js`: **44 passaram, 0 falharam.**

20 colunas existem · todas nullable · sem defaults · monetários NUMERIC(14,2) ·
allowlists escalares (pneus, três estados, IPVA, licenciamento, laudo, mecânica,
lataria) · **allowlist de cada elemento de `body_paint_issues`** · coerência de
financiamento · de multas · de IPVA · de motor/câmbio/suspensão · bicondicional
de lataria · não-array vira 23514 (nunca erro de tipo) · linha legada aceita ·
índice GIN existe · constraints de 052/053 intactas · nenhuma coluna de dado
pessoal.

**Teste contra elemento inventado** (exigido pela revisão):

| Entrada | Resultado |
|---|---|
| `["scratches"]` | ✅ aceita |
| `["scratches","dents"]` | ✅ aceita |
| catálogo inteiro (5 elementos) | ✅ aceita |
| `["banana"]` | ✅ **recusa** (`..._allowed_check`) |
| `["scratches","banana"]` | ✅ **recusa** — um elemento fora já basta |
| `[1,2]` | ✅ **recusa** |
| `{"scratches": true}` (objeto) | ✅ **recusa** |
| `"scratches"` (string JSON) | ✅ **recusa** (`..._array_check`) |
| `[]` com none/unknown | ✅ aceita |
| `NULL` (legado) | ✅ aceita |

Nota sobre o par de CHECKs: o `<@` tem uma regra própria — um **escalar** JSON é
considerado contido num array quando aparece como elemento, então
`'"scratches"'::jsonb <@ '[...]'::jsonb` é **verdadeiro**. Quem recusa esse caso
é o CHECK de `jsonb_typeof`. Os dois são necessários, e há um teste dedicado a
essa combinação exata — remover qualquer um dos dois o quebra.

Onde um valor viola os **dois** CHECKs (`"riscos"`, objeto), o teste aceita
qualquer um dos dois nomes: a ordem de avaliação não é promessa da
documentação, e a garantia que importa (ser violação, não erro de tipo) é
provada pelo teste de SQLSTATE.

Um teste confronta a allowlist do **banco** com `BODY_PAINT_ISSUES` do
**código**, importado — não reescrito. Uma lista mais larga no banco deixaria
passar o que a aplicação recusa; mais estreita derrubaria publicação legítima
com erro de constraint em vez de mensagem de campo.

### 16.5 (D) Round-trip e (E) concorrência

`sale-requests-concurrency.integration.test.js`: **17 passaram, 0 falharam.**

- **Round-trip** POST → PostgreSQL → GET detail com a ficha completa. NUMERIC
  volta como **string** de duas casas (`"18500.00"`), JSONB volta como **array**
  de verdade.
- Normalização condicional provada **na coluna**, não no DTO.
- Ficha inteira de "não sei" aceita; solicitação nova **sem** ficha recusada.
- **Linha legada continua legível** pelo detalhe, com a ficha em NULL.
- **Concorrência:** todos os testes antigos de teto/lock passaram **exercitando
  uma ficha válida** — o `bodyFor` foi corrigido para incluí-la. Sem essa
  correção eles passariam sem nunca chegar à transação, porque o service
  recusaria antes.

Rodados **juntos** também: **61 testes, 2 arquivos, 0 falhas**.

### 16.6 Correção de teste feita durante o gate

Um teste de round-trip que eu havia escrito esperava que
`body_paint_status: "none"` + `body_paint_issues: ["scratches"]` fosse
silenciosamente normalizado. **O teste estava errado, não o código:**
`validateBodyPaint` **recusa** essa combinação, e há teste unitário que o
comprova.

A assimetria é deliberada e ficou documentada no teste: dinheiro e descrições
abandonados são **limpos em silêncio** (resíduo de quem mudou de ideia com o
campo preenchido); detalhe de lataria marcado junto de "nenhum detalhe" é
**recusado**, porque a tela não consegue produzir essa combinação — ela só chega
de cliente malformado.

## 17–21. Suítes

| Verificação | Resultado |
|---|---|
| Backend (`npx vitest run --exclude tests/integration`) | ✅ **204 arquivos, 3194 testes, 1 skip** |
| Backend — só sale-requests | ✅ **216 testes** (5 arquivos) |
| **Integração PG — sale-requests-schema** | ✅ **44 testes** |
| **Integração PG — sale-requests-concurrency** | ✅ **17 testes** |
| **Integração PG — os dois juntos** | ✅ **61 testes** |
| **Migration em banco limpo (001..054)** | ✅ 54 aplicadas, 20/20 colunas |
| **Migration 053 → 054** | ✅ 53 → 54, linha legada preservada |
| Frontend (`npx vitest run`) | ⚠️ **3135 passam, 5 falham (baseline)** |
| Frontend — sale-requests | ✅ **97 testes** (evaluation 35, form 37, regressão 3, listagem/detalhe 22) |
| Typecheck (`tsc --noEmit`) | ✅ limpo |
| Lint backend (`npm run lint`) | ⚠️ **11 erros, todos baseline em `scripts/`** |
| Lint frontend (`next lint --max-warnings 0`) | ✅ **No ESLint warnings or errors** |
| Build (`next build`) | ✅ **Compiled successfully** |

## 22. Regressões e baseline

**Nenhuma regressão nova.**

As 5 falhas do frontend são **baseline confirmado**: rodei-as com o meu trabalho
em `git stash` e elas falham igual em `main` limpa.

- `app/seguranca/page.copy.test.ts` (2)
- `app/carros-usados/regiao/[slug]/page.config.test.ts` (3)

Nenhuma toca sale-requests. Os 11 erros de lint do backend estão todos em
`scripts/` (variáveis não usadas, blocos vazios) — arquivos que não encostei.

**`migrations-compat.integration.test.js` — 3 falhas, também baseline.** Só
apareceram agora porque a suíte de integração nunca tinha rodado (Docker
indisponível na fase anterior). São sobre a migration **020** e a recuperação de
banco legado (`null value in column "plan" of relation "users"`), sem nenhuma
relação com sale_requests.

Provado em dois passos: falham (a) com as mudanças desta fase em `git stash`, e
(b) com `054_sale_requests_vehicle_evaluation.sql` **removida do diretório**.
Registrado como tarefa separada — vale investigar se é teste desatualizado ou
defeito real no caminho que roda num banco de produção antigo.

**Uma flakiness introduzida e corrigida:** meus dois arquivos de teste do
formulário encadeiam 25+ interações e estouravam o `testTimeout` padrão de 5 s
sob carga da suíte completa — verdes isolados, vermelhos no conjunto. Elevei o
limite para 30 s **nesses dois arquivos**, com o motivo escrito no código. Um
teste que só falha sob carga treina quem lê a suíte a reexecutar até passar.

### Teste por mutação (§54) — executado e revertido

Duas mutações temporárias, ambas **detectadas**:

1. Requisito de cidade neutralizado (`state.cityId != null` → `true`)
   → **4 testes falharam**, incluindo os dois de regressão do CTA.
2. Guarda de km vazia removida (reintroduzindo o defeito original)
   → **3 testes falharam**, incluindo "campo VAZIO é incompleto".

Ambas revertidas; nenhuma commitada. Suíte verde depois da restauração.

Registro adicional: a primeira tentativa de aplicar a mutação 2 **não casou o
texto** e o script **abortou** em vez de seguir silenciosamente — exatamente a
armadilha de "replace que não casou" que já mordeu neste repositório.

## 23–25. Commits, branch, ahead/behind

Branch **`claude/sale-request-professional-evaluation`**, criada de `main` @
`d222e8c0`. **ahead 4, behind 0.** Sem merge, sem deploy.

1. `feat(sale-requests): add structured vehicle evaluation` — 13 arquivos
2. `feat(sale-requests): redesign owner evaluation form` — 17 arquivos
3. `docs(sale-requests): record evaluation sheet rollout` — relatório
4. `fix(sale-requests): enforce body paint allowlist in database` — hardening da
   054 (allowlist de elementos + correção do erro de tipo na bicondicional),
   testes PostgreSQL e este relatório atualizado

**Não commitados de propósito** (já untracked antes do trabalho): a imagem de
referência `frontend/public/images/vender-para-loja.png` — commitá-la em
`public/` a serviria publicamente em `/images/vender-para-loja.png` sem
necessidade — e `reports/fase-4-0-auditoria-venda-para-lojas-2026-08-15.md`.

## 26. O que foi preservado (não regrediu)

`sale_requests` separada de `ads`; zero superfície pública, slug ou SEO;
`owner_user_id` da sessão; PF/pending elegível; CNPJ recusado; cidade explícita
sem fallback; snapshot FIPE no servidor; limite de 3 abertas; lock em `users`;
transação request+images; posse das `storage_key` por prefixo; upload R2;
classificação 400 arquivo × 503 storage; normalização WebP; cancelamento;
listagem e detalhe do dono; mínimo 4 / máximo 12 fotos; **ausência de placa**;
**ausência de edição pós-publicação**.

Produto 1, `purchase_intents`, `ads`, SEO, pagamentos, assinaturas, admin,
workers e Redis: **intocados**. Nenhuma dependência nova.

## 27. Veredito

**GO DEFINITIVO** para revisão e merge.

O release gate PostgreSQL foi executado e está **100% verde**: banco limpo
001..054, upgrade 053→054 com linha legada preservada, 61 testes de integração,
3194 testes de backend, typecheck, lint e build. As duas pendências da revisão
anterior estão fechadas.

O gate **pagou por si mesmo**: encontrou um defeito real na 054 —
`jsonb_array_length` lançando erro de tipo onde deveria haver violação de
constraint — que nenhuma suíte unitária teria pego, porque nenhuma delas fala
com o PostgreSQL. Corrigido dentro da própria 054, com teste de regressão por
SQLSTATE.

Continua valendo: **sem merge e sem deploy** por decisão do escopo.
