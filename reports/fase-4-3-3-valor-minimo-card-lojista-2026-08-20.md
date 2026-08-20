# Fase 4.3.3 — Valor mínimo do proprietário + card limpo do lojista

Data: 2026-08-20
Branch: `codex/dealer-feed-ui-refinement`
Base: `origin/main` @ `ed2b0358` (merge do PR #39 — Fase 4.3.2)
Status: **não mergeada, não deployada**
Veredito: **NO-GO técnico** — um único item do gate ficou aberto (§17 abaixo)

---

## 1. Branch e SHA

```
branch        codex/dealer-feed-ui-refinement
base          ed2b0358  (origin/main, contém a 4.3.2 — verificado por merge-base)
ahead/behind  origin/main 0 ↔ HEAD N   (rebase limpo, sem conflito)
```

O rebase preservou `ac61ba67` (refinamento visual da 4.3.1→4.3.2), que reapareceu
como `f4d3797f` sobre a main. O trabalho desta fase entra em cima dele.

## 2. Base real usada

`origin/main` **contém** `ed2b0358e472182592923c9cddfb9379e1d6a87e`
(`git merge-base --is-ancestor` → verdadeiro). A pré-condição §0 foi satisfeita
antes de qualquer alteração.

## 3. Migration criada

**`056_sale_request_minimum_accepted_price.sql`** — a 055 continuava sendo a
maior (verificado por listagem, não presumido).

```sql
ALTER TABLE sale_requests
  ADD COLUMN IF NOT EXISTS minimum_accepted_price NUMERIC(14, 2);

CONSTRAINT sale_requests_minimum_accepted_price_check
  CHECK (minimum_accepted_price IS NULL OR minimum_accepted_price > 0)
```

Sem índice: nenhuma query filtra ou ordena por este campo — ele é lido junto da
linha já encontrada por `id` (dentro do lock) ou devolvido na projeção do feed.

## 4. Schema final

| Coluna | Tipo | Null | Regra |
|---|---|---|---|
| `minimum_accepted_price` | `NUMERIC(14,2)` | **SIM** (só por causa do legado) | `IS NULL OR > 0` |

**Obrigatório no código de criação, nullable no schema.** A divergência é
deliberada: `NOT NULL` exigiria um DEFAULT para as linhas que já existem, e todo
candidato é uma afirmação falsa sobre a intenção de alguém — 85% da FIPE atribui
uma recomendação comercial que a pessoa nunca leu; a maior proposta inverte a
causalidade (o piso passaria a subir sozinho); a própria FIPE encerra a
solicitação sem avisar; zero aceita tudo com aparência de declaração.

## 5. Comportamento de legado

`NULL` = a regra não existia quando a linha nasceu. **Nunca** convertido em
número em lugar nenhum:

- **ofertas**: sem proposta → mantém a regra histórica (`> 0`); com proposta →
  continua exigindo superar a maior atual;
- **card**: região de preço neutra (traço), nunca R$ 0,00 e nunca outro campo no
  lugar;
- **detalhe do lojista**: painel sem a linha de piso; resumo diz "Não informado";
- **detalhe da PF**: a linha simplesmente não é renderizada.

Cobertura: 3 testes unitários + 1 de concorrência real + 2 de tela.

## 6. Fluxo PF

Nova **seção 9 — "Defina um valor competitivo para as lojas"**, no FIM da ficha
(a única declaração econômica da tela; quem acabou de descrever pneus, laudo e
mecânica decide melhor o próprio piso).

```
REFERÊNCIA FIPE          FAIXA RECOMENDADA PARA VENDA A LOJISTAS
R$ 75.000                Até R$ 63.750

Valor mínimo que você aceita
[ R$ ____________ ]      ← começa VAZIO, sempre
Nenhuma loja poderá propor abaixo deste valor.
```

A cotação vem de `/api/fipe/quote/...` (endpoint que já existia), apenas para
orientar. **Não** viaja no corpo da publicação: o servidor resolve o próprio
snapshot pelos códigos e ignora qualquer valor do cliente.

A ficha passou de 8 para **9 seções essenciais** ("0 de 9 etapas").

## 7. Regra dos 15%

`SALE_REQUEST_DEALER_DISCOUNT = 0.15` (backend) espelhado em `DEALER_DISCOUNT`
(frontend), com **teste de sincronia** (`minimum-price-discount-sync.test.js`).

- teto recomendado = FIPE × 0,85;
- **acima da faixa NÃO bloqueia**: mostra o aviso comercial e oferece o anúncio
  convencional em **`/anunciar/novo`** (rota real, auditada — é a que o painel
  inteiro já usa);
- o servidor **não valida** a faixa. Há teste explícito de que publicar em
  74.000 com FIPE 75.000 é aceito, e outro de que publicar ACIMA da FIPE também.

## 8. Regra exata da PRIMEIRA oferta

Sem nenhuma proposta na solicitação:

```
aceita  ⇔  amount >= minimum_accepted_price        (piso NULL → só > 0)
```

`>=`, e não `>`: o piso é o valor que a pessoa disse que aceita; exigir um
centavo a mais recusaria exatamente a proposta que ela pediu.

Recusa → **409** com código próprio `SALE_OPPORTUNITY_OFFER_BELOW_MINIMUM` e
`minimum_accepted_price` no corpo (o alvo viaja junto, como já acontece com o
líder).

## 9. Regra exata das ofertas SEGUINTES

Com pelo menos uma proposta:

```
aceita  ⇔  amount > current_highest_offer
```

O piso deixa de ser consultado: a maior proposta já é necessariamente ≥ piso
(foi validada quando entrou), então revalidá-lo seria uma condição que nunca
reprova — e diria ao leitor que existem dois filtros vivos onde existe um por
estado.

Verificado: 62.500 empatando com o líder → recusa; 62.500,01 → aceita;
com líder 64.000 → 63.000 e 64.000 recusadas, 64.000,01 aceita.

## 10. Lock / concorrência

Nenhum mutex novo. O piso é lido **na mesma query** do `SELECT ... FOR UPDATE`
que já existia:

```sql
SELECT id, status, minimum_accepted_price
FROM sale_requests
WHERE id = $1 AND city_id = $2
FOR UPDATE
```

Sequência dentro da transação: lock (+piso) → status → maior atual → validação →
INSERT. Ler o piso fora do lock seria uma leitura de critério fora do mutex que
decide.

O fake-db casa a projeção **literalmente**: mover o piso para uma segunda query
faz o ramo deixar de casar e derruba os testes de oferta — alarme desejado.

## 11. DTOs alterados

| DTO | Campo | Observação |
|---|---|---|
| Dono (`serializeForOwner`) | `minimum_accepted_price` | + contrato de campos atualizado no teste |
| Lojista (`serializeSummary`, feed e detalhe) | `minimum_accepted_price` | + allowlist `DEALER_COLUMNS` |
| Payload de criação | `minimum_accepted_price` | obrigatório (não opcional no tipo) |

FIPE, maior proposta e proposta própria **continuam** no contrato do lojista — o
card é que parou de renderizá-las.

## 12. Card desktop

```
        [ FOTO 4:3 ]
Volkswagen              R$ 44.000,00
T-Cross
T-Cross 200 TSI 1.0 Flex 12V 5p Aut.
18.000 km          Flex
2016               Automático
📍 Atibaia - SP
      [ Fazer oferta ]
```

**Saíram**: FIPE, maior proposta, sua proposta, etiquetas de estado/leilão/laudo,
"Particular", tempo de publicação, "Ver detalhes" como botão.

O título é **marca + modelo** (sem o ano): dividindo a linha com o preço, o ano
dentro dele truncava o modelo — que é o dado que identifica o veículo. O ano foi
para a grade. **"2024/2024" não existe**: o produto coleta um ano só, e duplicá-lo
com barra inventaria a metade que ninguém perguntou.

O cartão inteiro continua clicável (o `after:inset-0` migrou para o link do
título); "Fazer oferta" tem `z-10` para não ser engolido — com teste de clique
real.

## 13. Card mobile

Item de lista horizontal: miniatura de 112px à esquerda, conteúdo à direita,
preço na primeira linha, metadados em duas colunas, um CTA. Mesmo DOM do
desktop, com classes responsivas (`flex-row` → `sm:flex-col`).

Guardas geométricas em 360/390/412: foto à esquerda do título, largura > altura,
altura ≤ 200px, CTA dentro do card, zero overflow.

## 14. Detalhe do lojista

Resumo do veículo: `Referência FIPE` **+** `Valor mínimo do proprietário`, lado a
lado (os dois números que emolduram a proposta).

Painel de proposta, na ordem: **Valor mínimo do proprietário** → Maior proposta /
Sua proposta → posição → distância para a FIPE → Nova proposta → Enviar.

O painel ganhou a checagem local das duas barreiras (com a mesma ordem do
servidor), que transforma um 409 previsível em resposta imediata com o alvo na
tela. Ela **não** substitui o servidor.

## 15. Detalhe da PF

Nova linha `Valor mínimo informado` no card "Dados do veículo". Sem edição
(§7: publicou, o piso congela) e sem redesenho da área.

## 16. Testes e quantidades

| Suíte | Resultado |
|---|---|
| `npm test` (backend completo, exclui integração) | **3.358 passaram**, 1 skip, 209 arquivos |
| `tests/sale-requests` | **380** (era 351 + 29 novos) |
| — `sale-requests-minimum-price.test.js` (novo) | 24 |
| — `minimum-price-discount-sync.test.js` (novo) | 5 |
| Frontend `components/account` + `lib/sale-requests` | **329**, 16 arquivos |
| — `SaleRequestForm` | 45 (8 novos da seção de valor) |
| — `DealerSaleOpportunities` | 31 (5 reescritos para o card novo) |
| — `DealerSaleOpportunityDetail` | 34 (5 novos das barreiras) |
| Playwright visual (360/390/412/768/1024/1440) | **31 passaram** |
| typecheck / lint frontend / build | ✅ / ✅ 0 warnings / ✅ |
| lint backend | 11 erros — **idênticos ao baseline**, todos em `scripts/`, zero em `src/` |

## 17. Testes PostgreSQL reais — **ESCRITOS, NÃO EXECUTADOS**

É o item que segura o GO.

**Escritos:**

- `tests/integration/sale-request-minimum-price.integration.test.js` (novo, 10
  casos): coluna/tipo/nullable, CHECK, NULL e positivo aceitos, zero e negativo
  recusados (23514), centavos preservados; e o **upgrade com dados** — linha
  inserida antes da migration, migration aplicada por cima, piso continua NULL e
  a FIPE de 75.000 **não** vira piso de 63.750; idempotência da reaplicação;
- `sale-request-offers-concurrency.integration.test.js` (+5 casos): primeira
  proposta abaixo do piso recusada, duas lojas na primeira proposta, disputa
  simultânea acima do piso com histórico crescente, **10 rodadas com jitter** e
  o caso legado.

**Não executados:** o Docker Desktop desta máquina não subiu o engine (o CLI fica
sem resposta indefinidamente; `docker version` estourou 45s). Há um PostgreSQL 16
local na 5432, mas as credenciais não estão no `.env` — e adivinhar senha não é
caminho. Para rodar:

```bash
npm run integration:db:up && npm run integration:db:wait && npx vitest run tests/integration/sale-request-minimum-price.integration.test.js tests/integration/sale-request-offers-concurrency.integration.test.js
```

O teste POR MUTAÇÃO do lock (que já existia) continua no arquivo e passa a cobrir
também o piso — mas, pelo mesmo motivo, não foi executado nesta rodada.

## 18. Screenshots / matriz de viewport

Capturados em `frontend/test-results/` (fora do git, sobrescritos a cada rodada):

| Viewport | Feed | Detalhe |
|---|---|---|
| 360 / 390 / 412 | lista horizontal, 1 col | sem overflow |
| 768 | 2 col | sem overflow |
| 1024 | 3 col | sem overflow |
| 1440 | 4 col, alturas iguais (Δ ≤ 2px) | sem overflow |

Nenhum PNG de referência foi commitado; os três continuam untracked.

**Não capturado:** a seção de valor da PF em Playwright — a fixture daquela
página precisa de sessão CPF + stub da cadeia FIPE e o mock de marcas não pegou.
A seção está coberta por 8 testes de componente que renderizam o componente real
(faixa recomendada, campo vazio, aviso, link do anúncio convencional, FIPE
indisponível, payload).

## 19. Diff

31 arquivos modificados (+1.246 / −381) e 6 novos:

```
src/database/migrations/056_sale_request_minimum_accepted_price.sql
frontend/lib/sale-requests/pricing.ts
frontend/components/account/SaleRequestPriceSection.tsx
tests/sale-requests/sale-requests-minimum-price.test.js
tests/sale-requests/minimum-price-discount-sync.test.js
tests/integration/sale-request-minimum-price.integration.test.js
```

## 20. Dívidas e riscos

1. **PostgreSQL real não executado** (§17). É o único item aberto do gate.
2. **`SET NOT NULL` futuro**: quando não houver mais linha anterior à 4.3.3 em
   produção (hoje existe 1 solicitação, criada em 18/08, que será NULL), a coluna
   pode virar `NOT NULL` em migration própria — decisão sobre DADOS existentes,
   não sobre intenções perdidas.
3. **A linha de produção ficará com piso NULL.** Ela foi publicada antes desta
   regra; o card mostrará traço. É o comportamento correto — mas vale saber antes
   de olhar a tela.
4. **A cotação FIPE da tela e o snapshot do servidor podem divergir** entre o
   momento de preencher e o de publicar (provedor externo, cache de 1h no
   frontend). O efeito máximo é a faixa recomendada da tela ter sido calculada
   sobre um valor levemente diferente do gravado — nunca um valor errado no
   banco.
5. **Piso imutável (§7)**: não há PATCH. Quem quiser mudar precisa cancelar e
   republicar; o fluxo de republicação não existe e não foi criado.
6. **Lint do backend**: 11 erros pré-existentes em `scripts/` (baseline idêntico
   antes e depois). Prettier segue com o débito legado já registrado.

## 21. Checklist do §59

| Item | Estado |
|---|---|
| PF informa valor mínimo obrigatório | ✅ |
| Orientação de 15% visível, não bloqueante | ✅ |
| Publicação acima de 85% permitida | ✅ |
| FIPE indisponível não impede publicar | ✅ |
| Primeira oferta ≥ piso | ✅ |
| Ofertas seguintes > maior atual | ✅ |
| Legado NULL sem valor inventado | ✅ |
| Validação dentro do lock existente | ✅ (unitário; PG real pendente) |
| Card mostra só o piso | ✅ |
| Card sem FIPE/maior/sua proposta | ✅ |
| Card sem badges/Particular/tempo | ✅ |
| Mobile em lista compacta ≤ 200px | ✅ |
| CTA "Fazer oferta" → `#proposta`, clicável | ✅ |
| Detalhe mantém os quatro valores | ✅ |
| PF vê o piso que declarou | ✅ |
| Privacidade preservada | ✅ (contrato de campos do feed testado) |
| **Concorrência provada em PostgreSQL real** | ❌ **pendente de execução** |
| Migration provada em PostgreSQL real | ❌ **pendente de execução** |
| typecheck / lint / build | ✅ |
| Zero regressão nova | ✅ |

**NO-GO** até os dois itens em vermelho rodarem. Todo o resto está verde, e os
testes que faltam já estão escritos — falta o banco.
