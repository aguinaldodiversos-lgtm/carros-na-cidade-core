# Fase 4.9 — WhatsApp como segunda opção + recuperação da negociação

**PARADA NA AUDITORIA (§2). Zero alteração de código.**

| | |
|---|---|
| Branch | `codex/sale-request-whatsapp-recovery` |
| Base SHA | `70932440ef0da47e44de75dca9764fd585afde5f` (main; contém `0c11cf29`) |
| HEAD | este relatório, e nada mais |
| Migrations criadas | **nenhuma** |
| Arquivos de produto alterados | **nenhum** |

O §2 manda: *"Se a auditoria encontrar qualquer discrepância entre o código atual
e esta descrição: PARAR e documentar antes de reconstruir qualquer fluxo."*

A auditoria encontrou uma discrepância que atinge o **pressuposto central** da
fase. Este relatório documenta, e para.

---

## Auditoria Fase 4.9

### O achado

> **Não existe sistema de agendamento no Produto 2.**
>
> A Fase 4.7 o removeu deliberadamente, e a Fase 4.8 homologou essa remoção.

O §2 pede para preservar "o sistema atual de agendamento da avaliação
presencial", com a lista de coisas a não tocar: horários, disponibilidade,
criação, confirmação, reagendamento. **Nada disso está em produção.** O que
existe é o handoff direto: aceitar a oferta libera nome, endereço e WhatsApp da
loja, e a avaliação é combinada fora da plataforma.

Isso não é uma leitura minha do histórico — está escrito no cabeçalho do próprio
componente, `SaleRequestHandoff.tsx:21-32`:

> *"O QUE ESTA TELA SUBSTITUIU — Escolher horário, ver a agenda, acompanhar a
> inspeção, comparar 'declarado × observado', receber proposta final e
> aceitá-la. Seis momentos que a plataforma tentava orquestrar e que agora
> acontecem entre duas pessoas, no WhatsApp (…). O que ficou: o nome da loja, o
> valor aceito, o endereço, um botão para falar com ela — e uma saída para
> quando não der certo."*

E o §2 desta fase também diz **"Não reativar sistema antigo"** — o que confirma
que reativar a agenda não é o que se quer. As duas frases só são compatíveis se
a agenda estivesse viva. Ela não está.

### Mapa do que existe hoje

| O que a fase pede | Onde está | Situação |
|---|---|---|
| Componente do handoff PF | `frontend/components/account/SaleRequestHandoff.tsx` | existe |
| **Componente do agendamento** | — | **não existe** (`SaleRequestInspection.tsx` foi deletado pela 4.7) |
| **CTA de agendamento** | — | **não existe** |
| Rotas/backend do agendamento | `sale-requests.inspection.service.js` etc. | existem, mas **todos os writers recusam com 409 `LEGACY_FLOW_RETIRED`** |
| Tela legada | `SaleRequestLegacyFlow.tsx` | **read-only** — só exibe o histórico de quem viveu o fluxo 4.5 |
| Endpoint de WhatsApp | `GET /api/account/sale-requests/:id/handoff/whatsapp` | existe |
| Helper de normalização | `normalizeWhatsappDigits` — `src/shared/utils/brPhone.js` | existe |
| `advertiser.whatsapp` | `sale-requests.handoff.repository.js:176` | existe |
| Endereço comercial | `handoff-address` (com fallback para cidade) | existe |
| Fluxo `no_agreement` | `handoff-no-agreement-cta` + append-only | existe |
| Tela de outras ofertas | `owner-handoff-failed` + cards `sale-request-proposal` | existe |
| Criação de nova rodada | `handoff-new-round-cta` + `POST /:id/rounds` | existe |
| Testes correspondentes | `SaleRequestHandoff.test.tsx` — **25 testes** | existem |

### Os três objetivos, conferidos um a um

**Objetivo 1 — "PRESERVAR integralmente o sistema atual de agendamento".**
Vazio: não há o que preservar. Nenhum arquivo de agendamento pode mudar nesta
fase porque nenhum participa do fluxo ativo.

**Objetivo 2 — "adicionar um botão de WhatsApp como SEGUNDA opção".**
**Já existe** — e é a opção *principal*, porque não há a outra. Conferido na
homologação da 4.8, captura `03-owner-handoff-whatsapp.png`:

```
OFERTA ACEITA
Loja Atibaia
R$ 65.000,00
Entre em contato com a loja para combinar a avaliação presencial do veículo.
ENDEREÇO DA LOJA — Av. Jerônimo de Camargo, 1200 — Alvinópolis, Atibaia - SP
[ Falar com a loja pelo WhatsApp ]
A avaliação, eventual revisão do valor e a negociação da compra são
realizadas diretamente entre você e a loja.
[ Não houve acordo com esta loja ]
```

Todos os requisitos §4–§7 já estão atendidos, inclusive os negativos:

- usa `advertisers.whatsapp` e **só** ele. O repositório documenta exatamente o
  risco do §4: *"o schema tem cinco colunas de contato por herança (migrations
  antigas), e usar qualquer uma delas como 'o WhatsApp' entregaria o número
  pessoal de um operador no lugar do canal comercial da loja"*;
- normalização pelo helper compartilhado, sem DDI duplicado;
- mensagem sem CPF, e-mail, ids ou **valor**;
- loja sem WhatsApp → 409 `STORE_WHATSAPP_UNAVAILABLE`, mensagem discreta na
  tela (`handoff-whatsapp-error`), endereço continua aparecendo, nada quebra.

**Objetivo 3A — "ver e aceitar outras ofertas anteriores".**
**Já existe.** Depois do `no_agreement`, o card `owner-handoff-failed` diz
*"Você pode aceitar outra oferta já recebida ou abrir uma nova rodada de
propostas"*, e as ofertas restantes voltam como cards com "Aceitar oferta" cada
uma. Provado no E2E da 4.7 (`toHaveCount(2)` após o no-agreement) e na captura
`06-owner-outras-ofertas.png`.

**Objetivo 3B — "republicar para receber novas ofertas".**
**Já existe**, e já é implementado como *round*, não como sale_request nova —
exatamente o que o §13 pede. O modal já traz o que o §14 descreve: piso atual,
input de novo piso (não obrigatório), a ressalva do histórico, Cancelar/Confirmar.

### Cobertura de teste

Os §21 e §23 pedem testes que **já existem**, entre os 25 de
`SaleRequestHandoff.test.tsx`:

```
mostra loja, valor, endereço e o botão de WhatsApp
o WhatsApp é resolvido no clique, e a tela apenas abre a URL recebida
loja sem WhatsApp mostra a mensagem do servidor, sem quebrar a tela
não existe agenda, inspeção, proposta final nem aceite final
mostra as OUTRAS ofertas, com o botão de aceitar em cada uma
oferece o separador 'ou' e o botão de nova rodada
sem outras ofertas, não há separador — a rodada nova é a única saída
o diálogo mostra o piso atual e nasce preenchido com ele
envia o piso NOVO
```

Mais o E2E `sale-request-handoff-rounds.spec.ts`, que percorre o §24 quase
inteiro — aceite, handoff, WhatsApp da Loja A, ausência do card de avaliação,
no_agreement, outras ofertas, resseleção, WhatsApp da Loja B, nova rodada — e
passou 3× verde na homologação da 4.8.

---

## O que sobra de real

Descontado o que já existe, resta **copy** — e só:

| # | Hoje | O que a 4.9 prefere | § |
|---|---|---|---|
| C1 | `handoff-new-round-cta` diz **"Receber novas ofertas"** | **"Republicar anúncio"** | §10, §13 |
| C2 | Título do diálogo: "Receber novas ofertas" / confirmar: "Iniciar nova rodada" | "Republicar anúncio" | §14 |
| C3 | As outras ofertas aparecem **direto**, sem botão intermediário | um caminho rotulado **"Ver outras ofertas"** | §10, §11 |
| C4 | Mensagem: "…gostaria de **combinar** a avaliação presencial." | "…gostaria de **falar sobre** a avaliação presencial." | §6 |

Sobre C3: hoje as ofertas restantes já ficam visíveis assim que o
`no_agreement` é confirmado. Trocar isso por um botão **acrescenta** um clique
entre a pessoa e a informação que ela precisa para decidir. Registro como
contraindicação, não como recusa — é decisão de produto.

C4 é cosmético: as duas frases dizem a mesma coisa, e a atual já está coberta
por teste.

**Nenhum desses quatro itens justifica sozinho uma fase.** Todos juntos são um
diff de copy em um arquivo e um de constantes.

---

## Prova de que nada mudou

```
$ git status --short
?? frontend/public/images/lojista-detalhe-veiculo-referencia.png
?? frontend/public/images/lojista-oportunidades-veiculos-referencia.png
?? frontend/public/images/vender-para-loja.png
?? reports/fase-4-0-auditoria-venda-para-lojas-2026-08-15.md
```

Os quatro arquivos protegidos do usuário seguem intocados e fora do Git. Nenhum
comando proibido foi usado. Nenhum arquivo de agendamento, schema, migration,
service ou repository foi aberto para escrita — a auditoria inteira foi leitura.

---

## GO/NO-GO

**NO-GO para implementar como especificado**, por impossibilidade do
pressuposto, não por defeito.

- Objetivo 1 é vazio — não há agendamento a preservar.
- Objetivos 2 e 3 já estão em produção desde a 4.7, homologados na 4.8.
- O §3 pede dois CTAs lado a lado ("Agendar avaliação" *ou* "WhatsApp"); o
  primeiro não existe, então o layout descrito não é construível sem
  **reativar o sistema antigo** — que o próprio §2 proíbe.

**Nada foi alterado.** A decisão sobre C1–C4, e sobre a pergunta maior — se a
agenda deve ou não voltar —, é do dono do produto.

**NÃO PUSHADO. NÃO MERGEADO. NÃO DEPLOYADO.** Aguardando revisão.
