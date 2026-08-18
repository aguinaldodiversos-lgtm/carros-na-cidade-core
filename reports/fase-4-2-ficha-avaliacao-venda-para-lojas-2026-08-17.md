# Ficha preliminar de avaliação — "Enviar meu carro para as lojas"

**Data:** 2026-08-17
**Branch:** `claude/sale-request-professional-evaluation`
**Base:** `main` @ `d222e8c0` (merge da Fase 4.1)
**Commits:** 3 · **ahead 3 / behind 0**
**Veredito:** **GO** para revisão e merge, com duas pendências de verificação registradas em §16.

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

No banco, a lataria é uma **bicondicional**: `(status = 'issues') = (nº de
detalhes > 0)`, que barra as duas contradições possíveis num CHECK só.

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

## 16. PostgreSQL — **NÃO EXECUTADO**

**Docker não está rodando** nesta máquina e não há Postgres em
`127.0.0.1:5433` (`ECONNREFUSED`). Os testes de integração foram **escritos e
verificados sintaticamente**, mas **não executados**.

Escritos (prontos para rodar com `npm run integration:db:up`):

- **`sale-requests-schema`** (+13 testes): colunas existem e são nullable sem
  default; monetários são NUMERIC(14,2); linha legada continua sendo aceita;
  allowlists recusam valor inventado; coerência cruzada nas cinco regras;
  bicondicional de lataria; `body_paint_issues` só aceita array; índice GIN
  existe; constraints de 052/053 intactas; nenhuma coluna de dado pessoal.
- **`sale-requests-concurrency`** (+5 testes): round-trip POST → banco → GET com
  todos os campos; normalização condicional provada **na coluna** (não no DTO);
  ficha inteira de "não sei"; recusa sem ficha; **linha legada continua legível
  com a ficha em NULL**.

Também corrigi o `bodyFor` desse arquivo para incluir a ficha — sem isso, todos
os testes de concorrência existentes passariam sem nunca exercitar o lock.

> **Pendência 1:** rodar a suíte de integração com Docker.
> **Pendência 2:** teste de migration em banco limpo (1..054) e em banco com
> 052/053 aplicadas — depende do mesmo Docker.

## 17–21. Suítes

| Verificação | Resultado |
|---|---|
| Backend (`npx vitest run --exclude tests/integration`) | ✅ **204 arquivos, 3194 testes, 1 skip** |
| Backend — só sale-requests | ✅ **216 testes** (5 arquivos) |
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
`d222e8c0`. **ahead 3, behind 0.** Sem merge, sem deploy.

1. `feat(sale-requests): add structured vehicle evaluation` — 13 arquivos
2. `feat(sale-requests): redesign owner evaluation form` — 17 arquivos
3. `docs(sale-requests): record evaluation sheet rollout` — este relatório

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

**GO** para revisão e merge, condicionado a rodar a suíte de integração
PostgreSQL (§16) antes do deploy — é a única camada que os CHECKs da migration
054 e o round-trip realmente exercitam, e ela não pôde ser executada aqui.
