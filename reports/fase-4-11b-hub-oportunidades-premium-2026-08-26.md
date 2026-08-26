# Fase 4.11B — Remodelagem premium do hub de Oportunidades

**Data:** 2026-08-26
**Escopo:** `/dashboard-loja/oportunidades` — a tela em que o lojista escolhe
entre **vender** do próprio estoque e **comprar** para repor.

---

## 1. Base e branch

| item | valor |
|---|---|
| base (main) | `37a51b73` — inclui a 4.11A já mergeada (PR #48) |
| branch | `codex/dealer-opportunities-hub-premium` |
| migration | **nenhuma** |

Os quatro arquivos locais protegidos do usuário continuam intactos e untracked.

---

## 2. O que a tela era

Duas caixas brancas visualmente **idênticas**, cada uma com um título, uma frase
e o mesmo botão azul. Nada distinguia "vender" de "comprar" antes da leitura — e
os dois caminhos fazem coisas opostas.

Sem números, sem ilustrações, sem explicação do fluxo.

## 3. O que a tela é agora

```
Oportunidades
Escolha como deseja gerar negócios: vender para compradores ativos ou
comprar veículos para repor seu estoque.

┌──────────┬──────────┬──────────┬──────────┐   ← 4 métricas REAIS
│ 128      │ 76       │ 34       │ 22       │
└──────────┴──────────┴──────────┴──────────┘

┌────────────────────────┬────────────────────────┐
│ 🔵 Compradores ativos   │ 🟢 Veículos p/ avaliação│   ← 2 caminhos
│    (VENDER do estoque)  │    (COMPRAR p/ repor)   │
└────────────────────────┴────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Como funciona — 2 fluxos × 3 passos             │
└─────────────────────────────────────────────────┘
```

A distinção agora é dada **antes da leitura**: cor, ilustração e verbo
diferentes de cada lado. Azul = vender; verde-água = comprar.

---

## 4. A decisão mais importante desta fase: os números são contados

A referência visual mostra `128`, `76`, `34`, `22` e quatro etiquetas verdes
("+18% nos últimos 7 dias").

**Auditoria: nenhum dos oito existia.**

| dado | existia antes? |
|---|---|
| contagem de compradores ativos | **não** — o feed de procuras não tem `COUNT` nenhum |
| contagem de veículos para avaliação | sim (`summary.total` do feed) |
| novas oportunidades hoje | parcial (só do lado das solicitações) |
| negócios em andamento | **não** |
| as quatro variações de 7 dias | **não** — não há tabela de histórico |

Havia dois caminhos: preencher com números ilustrativos, ou construir a fonte.

**Construí a fonte.** Um número inventado no topo de uma tela de decisão é
exatamente o que faz alguém decidir errado com confiança — e este repositório já
tem uma cicatriz disso (`market-data.ts` fabricava média FIPE por hash do slug).

### Novo endpoint `GET /api/account/opportunities/summary`

```
src/modules/dealers/dealer-opportunities-summary.repository.js   ← 3 COUNT(*)
src/modules/dealers/dealer-opportunities-summary.service.js      ← montagem + tendência
src/modules/dealers/dealer-opportunities-summary.routes.js       ← auth + CNPJ
frontend/app/api/account/opportunities/summary/route.ts          ← BFF
```

| cartão | fonte |
|---|---|
| Compradores ativos | `purchase_intents` `status='active' AND expires_at > NOW()` na cidade da loja — **o mesmo predicado de `listActiveByCity`** |
| Veículos para avaliação | `sale_requests` `status='receiving_offers'` na cidade — **o mesmo predicado do feed** |
| Novas oportunidades hoje | soma das entradas de hoje nos dois produtos |
| Negócios em andamento | `sale_requests` em `SALE_REQUEST_SELECTED_STATUSES` cuja **oferta selecionada é desta loja** |

**As variações são computáveis sem histórico**: comparam o que entrou nos
últimos 7 dias com o que entrou nos 7 dias anteriores, lido de `created_at` (e
de `selected_offer_at` para os negócios — a data em que o negócio *entrou* em
andamento, não a data de publicação).

As janelas são calculadas **no banco** (`NOW() - INTERVAL '7 days'`), não na
aplicação: relógios divergentes entre app e banco produziriam variação fantasma
na virada do horário de verão.

### A regra que salva o número de mentir

```js
if (before <= 0) return null;   // sem base, não há variação
```

Este produto roda hoje com **uma cidade e poucas dezenas de registros** — a faixa
em que percentual mais engana: 1 → 2 é "+100%". Quando a janela anterior é zero,
o backend devolve `trend: null` e a tela troca a etiqueta verde por
**"sem base de comparação"**.

`0%` no lugar do `null` seria pior que errado: afirmaria estabilidade onde não
existe medida nenhuma.

---

## 5. Ilustrações

SVG **inline**, recriadas no estilo da referência (volume por gradiente, cantos
muito arredondados, sombra difusa). Não são PNG porque:

- nítidas em qualquer densidade, sem @2x/@3x;
- poucos KB dentro do HTML — zero request, zero layout shift;
- as cores saem dos mesmos tokens do resto da página.

**A armadilha que isto tranca:** `id` de gradiente em SVG é global ao
**documento**. Duas ilustrações com um `id="grad"` cada fariam a segunda pintar
com o gradiente da primeira — o carro verde sairia azul, sem erro no console e
sem teste de presença acusando. Todo id carrega o prefixo do próprio bloco, e há
um teste E2E que conta ids únicos.

---

## 6. Correções encontradas pelas capturas

Duas coisas que só apareceram ao olhar a tela renderizada:

1. **O número do 3º cartão saía desalinhado.** "Novas oportunidades hoje" é o
   único rótulo que quebra em duas linhas na largura de quatro colunas, e isso
   empurrava o número ~16px para baixo — a régua de métricas perdia o
   alinhamento horizontal que a faz ser lida de relance. Corrigido reservando
   duas linhas **a partir de `xl`, e só ali**: abaixo disso os cartões são largos,
   nenhum rótulo quebra, e a reserva viraria vão morto no celular.

2. **O carro da 2ª ilustração lia-se como adereço da prancheta**, e a lupa se
   fundia com a traseira dele numa mancha verde só. O carro foi ampliado para
   atravessar a base da figura e a lupa subiu para (72, 74) com raio 32.

O esqueleto de carregamento espelha a caixa de cada linha do cartão cheio —
inclusive o `xl:min-h-[31px]`. Copiar a altura da **caixa** (e não a do tracinho
cinza dentro dela) é o que impede a página de saltar quando o resumo chega.

---

## 7. Sidebar e shell

**Preservados.** Este hub é tela de **navegação**: tirar o menu dela deixaria o
lojista sem saída. É o contraste deliberado com a 4.11A, em que o *detalhe* de um
veículo entra em modo foco. A fronteira vive em `lib/account/focus-routes.ts`, e
o E2E prova o lado "continua com barra" dela no navegador.

## 8. Responsividade

| largura | métricas | caminhos |
|---|---|---|
| 360 / 390 / 412 | 1 coluna | empilhados |
| 768 | 2 colunas | empilhados |
| 1024 | 2 colunas | lado a lado |
| 1280 / 1440 | 4 colunas | lado a lado |

Sem overflow horizontal em nenhuma das sete larguras, com o CTA medido
individualmente (um botão que estoura a coluna some do `scrollWidth` do
documento se algum pai tiver `overflow`).

---

## 9. Testes

| suíte | resultado |
|---|---|
| `tests/dealers/` (novo) | **17 passando** |
| `components/account/opportunities/` (novo) | **11 passando** |
| E2E `dealer-opportunities-hub.spec.ts` (novo) | **17 passando** |
| typecheck + lint | limpos |

O fake do teste de backend **re-implementa as janelas e o escopo**, não devolve
linha pronta: apagar `WHERE pi.city_id = $1` do repository faz o teste de
vazamento entre cidades falhar.

O E2E prova o que jsdom não vê: quatro cartões numa linha só em 1440, os dois
CTAs na mesma altura (o que o `mt-auto` garante), ids de gradiente sem colisão, e
a ausência de etiqueta verde quando `trend` é `null`.

**Um teste meu nasceu errado e foi trocado:** a varredura de privacidade por
substring acusava `active_buyers` por conter "buyer". Virou prova **estrutural** —
percorre todas as folhas do payload e exige que cada uma seja número, direção
conhecida ou `null`. Prova mais: um campo de identidade novo quebra o teste sem
que ninguém precise prever o nome dele.

## 10. Screenshots

`reports/screenshots/fase-4-11b/`:

```
01-hub-desktop-1440.png        04-hub-mobile-390.png
02-hub-desktop-cards.png       05-hub-tablet-768.png
03-hub-desktop-how-it-works.png 06-hub-sem-base-comparacao.png
```

## 11. Dívidas

1. **`purchase_intents` não tem índice para as janelas de data.** Com uma cidade
   e dezenas de linhas isso é irrelevante; com milhares, `created_at` por cidade
   pede índice. Medir antes de criar.
2. **"Negócios em andamento" conta só o lado das solicitações de venda.** Ofertas
   enviadas pelo lojista em procuras ativas (`purchase_intent_offers`) também são
   negócio em andamento, mas a tabela não tem status — não há como distinguir
   "viva" de "abandonada" sem inventar critério.
3. Falhas pré-existentes na main seguem valendo (ver relatório da 4.11A §21).

## 12. GO / NO-GO

**GO.**

- [x] mesma estrutura, hierarquia e organização da referência
- [x] 4 cartões de métrica com número, rótulo e variação
- [x] **todos os números contados, nenhum ilustrativo**
- [x] 2 cards principais com ilustrações na família visual da referência
- [x] azul para compradores, verde-água para veículos
- [x] listas com check icons, CTA principal e "Como funciona"
- [x] seção "Como funciona" com 2 fluxos × 3 passos
- [x] sidebar e cabeçalho do painel preservados
- [x] responsivo em 7 larguras, sem overflow
- [x] sem migration
- [x] navegação funcional inalterada (os dois destinos são os mesmos)
