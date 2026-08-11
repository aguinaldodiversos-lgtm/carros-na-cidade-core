# Fase 1 — Notificações Internas

Data: 2026-08-10
Branch: `codex/opportunities-phase-1-notifications`

Infraestrutura genérica de caixa postal por usuário. Nenhum dos dois produtos do
Motor de Oportunidades foi implementado.

---

## Estado inicial

| Item                       | Valor                                                          |
| -------------------------- | -------------------------------------------------------------- |
| Branch de origem           | `main`                                                         |
| HEAD inicial               | `2441a15c563f7d44385d759389a715b7cbf80a70` (merge da Fase 0.1) |
| Working tree               | limpo                                                          |
| `git pull --ff-only`       | _Already up to date_                                           |
| Última migration existente | `048_analytics_platform.sql` → nova é **049**                  |

### Baseline de testes (antes de qualquer alteração)

| Suíte               | Resultado                                        |
| ------------------- | ------------------------------------------------ |
| Backend `npm test`  | **VERDE** — 184 arquivos, 2482 testes, 1 skipped |
| Frontend `npm test` | **5 falhas** pré-existentes — ver abaixo         |
| `tsc --noEmit`      | VERDE                                            |

**BASELINE FAILURE** (idêntico ao registrado na Fase 0.1, nenhuma relação com
notificações):

- `app/seguranca/page.copy.test.ts` — 2
- `app/carros-usados/regiao/[slug]/page.config.test.ts` — 3 (flaky, vazamento de
  `process.env` entre workers)

---

## Schema

Migration: `src/database/migrations/049_user_notifications.sql`

```
user_notifications
  id                 BIGSERIAL PK
  recipient_user_id  BIGINT NOT NULL → users(id) ON DELETE CASCADE
  event_type         TEXT NOT NULL          (sem ENUM — ver abaixo)
  title              TEXT NOT NULL
  body               TEXT NOT NULL
  entity_type        TEXT NULL              (polimórfico, sem FK)
  entity_id          TEXT NULL
  action_path        TEXT NULL              (só caminho interno; validado na app)
  payload            JSONB NOT NULL DEFAULT '{}'
  idempotency_key    TEXT NOT NULL
  read_at            TIMESTAMPTZ NULL       (NULL = não lida)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### FK

`recipient_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE`.

Decidido **por evidência do banco real**, não por dedução: `users.id` é
`integer` em produção embora a migration 002 o declare `BIGSERIAL`. Consultamos
o que já funciona lá e copiamos `support_tickets.user_id`, que é `bigint` com FK
operante para esse mesmo `integer`. Precedente provado em produção vale mais que
um tipo "mais correto" que nunca foi exercitado neste banco.

`CASCADE` pelo mesmo precedente e porque é o comportamento certo: notificação
sem destinatário não tem utilidade nem valor de auditoria — diferente de
`support_ticket_messages.author_id`, que é `SET NULL` para preservar a thread.

**Nenhuma FK para `ads`, `advertisers`, `subscription_plans`, `payments` ou
`leads`.** Há teste de integração afirmando essa ausência.

### Índices e constraints

| Nome                                            | Tipo                                                | Serve a               |
| ----------------------------------------------- | --------------------------------------------------- | --------------------- |
| `user_notifications_recipient_idempotency_uidx` | UNIQUE `(recipient_user_id, idempotency_key)`       | idempotência          |
| `user_notifications_recipient_created_idx`      | `(recipient_user_id, created_at DESC, id DESC)`     | listagem + cursor     |
| `user_notifications_recipient_unread_idx`       | PARCIAL `(recipient_user_id) WHERE read_at IS NULL` | contador de não lidas |

`event_type` é TEXT livre, sem ENUM: adicionar `sale_request.outbid` no futuro
não pode exigir migration. O vocabulário fica documentado em
`notifications.constants.js`.

### Duas decisões que fogem do padrão local, de propósito

1. **Esta migration não engole erro.** As 043–046 usam
   `DO $$ ... EXCEPTION WHEN OTHERS THEN RAISE NOTICE`, o que era correto lá:
   eram migrations _retroativas_ sobre tabelas que já existiam em produção. Aqui
   a tabela é nova, e engolir a exceção marcaria a migration como aplicada com a
   tabela inexistente — o app subiria e quebraria em runtime. É o mesmo modo de
   falha que a Fase 0.1 encontrou na migration 008. DDL idempotente sim; erro
   silencioso não.

2. **`read_at` sozinho**, sem `is_read` em paralelo. Dois campos para um fato só
   divergem.

---

## Idempotência

**Estratégia:** garantia no banco, não na aplicação.

```sql
INSERT INTO user_notifications (...)
VALUES (...)
ON CONFLICT (recipient_user_id, idempotency_key) DO NOTHING
RETURNING ...
```

Quando não retorna linha, o repositório busca a existente e devolve
`{ notification, created: false }`.

**Por que escopada por destinatário e não `UNIQUE(idempotency_key)` global:** um
fan-out legítimo notifica mais de uma pessoa sobre o MESMO evento — o
proprietário e o lojista superado recebem `sale_request:12:bid:34`. Com chave
global, a segunda inserção legítima falharia.

**Por que constraint e não `SELECT` + `if (!exists) INSERT`:** aquele padrão tem
janela de corrida — dois processos leem "não existe" e ambos inserem.

**Comportamento no conflito:** `created: false` com a notificação vigente.
**Nunca 500** — um retry legítimo do produtor não pode derrubar o fluxo que
gerou o evento.

Provado com 8 INSERTs **concorrentes** contra PostgreSQL real: exatamente 1
linha.

---

## Segurança

### Autenticação

Todas as rotas passam por `authMiddleware`. **Não** usam `requireDealerAccount`:
notificação pertence a qualquer conta autenticada — CPF, CNPJ e `pending`.
Restringir a lojista esconderia do comprador do Produto A justamente as
notificações endereçadas a ele.

### Ownership

O escopo vive no **WHERE de toda query**, nunca num `if` do service:

```sql
UPDATE user_notifications
SET read_at = COALESCE(read_at, NOW())
WHERE id = $1 AND recipient_user_id = $2
```

Notificação alheia simplesmente não casa. Não existe caminho em que uma linha de
outro usuário seja lida e depois recusada.

O `recipient_user_id` vem **sempre** de `req.user.id`. Há teste passando
`?recipient_user_id=<outro>` e `?user_id=<outro>` na query, afirmando que a
resposta continua sendo do dono da sessão.

### IDOR

Id alheio → **404**, não 403. 403 confirmaria que a notificação existe. Id
inexistente, id alheio e id malformado são indistinguíveis de fora.

`parseNotificationId` exige a string inteira em dígitos: `Number.parseInt`
sozinho leria o prefixo (`"1.5"` → 1, `"12abc"` → 12) e a rota agiria sobre um
recurso que ninguém pediu.

### `action_path`

**Allowlist** de prefixo (`/dashboard`, `/dashboard-loja`), não blocklist — uma
blocklist precisa prever cada forma de escapar; uma allowlist só precisa saber
para onde o produto de fato manda o usuário.

Camadas, na escrita: tamanho → caracteres inseguros literais (espaço,
control-char, DEL, `\`) → `%5C` → precisa começar com `/` e não com `//` →
resolução contra origem sentinela (mata `..`) → allowlist sobre o pathname.

O casamento é `prefixo` exato **ou** `prefixo + "/"`, nunca `startsWith` cru:
`"/dashboard-loja".startsWith("/dashboard")` é verdadeiro, então um prefixo
solto aceitaria `/dashboard-qualquer-coisa`.

Segunda barreira no cliente (`isSafeInternalPath`), porque o dado pode ter sido
gravado antes de uma regra mudar. O custo de recusar é "não navega"; o de
aceitar é mandar um usuário logado para fora do portal a partir de um clique em
que ele confia.

33 casos de ataque cobertos por teste: esquema explícito, protocol-relative,
barra-invertida crua e percent-encoded, control-char, traversal, e o prefixo
solto.

### Superfície de criação

**Não existe endpoint público de criação.** Notificação nasce de código interno
(`createUserNotification`). Há teste afirmando que `POST` na coleção não é rota.

### Renderização

`title` e `body` são texto puro (React escapa). Nenhum
`dangerouslySetInnerHTML`. Teste afirma que `<img src=x onerror=alert(1)>`
aparece literalmente e não vira elemento no DOM.

### Cache

Todas as respostas: `Cache-Control: private, no-store` — backend e BFF.
Verificado por teste e no navegador.

### Log

`eventType`, `recipientUserId`, `entityType` e `created`. **Nunca** `title`,
`body` ou `payload` — é onde dado de pessoa pode acabar caindo.

---

## API

Montada em `/api/account/notifications`, **antes** de `/api/account` no
`app.js` — prefixo mais específico primeiro, mesma razão de `/api/public/seo`
vir antes de `/api/public`.

| Método | Rota            | Resposta                                           | Status          |
| ------ | --------------- | -------------------------------------------------- | --------------- |
| GET    | `/`             | `{ success, notifications[], next_cursor, limit }` | 200 / 401       |
| GET    | `/unread-count` | `{ success, count }`                               | 200 / 401       |
| PATCH  | `/:id/read`     | `{ success, notification }`                        | 200 / 401 / 404 |
| PATCH  | `/read-all`     | `{ success, updated }`                             | 200 / 401       |

`unread-count` e `read-all` são declarados **antes** da rota com `:id` para que
nunca possam ser lidos como identificador.

**Paginação:** `limit` default 20, máximo 50, clampado no servidor — o cliente
não escolhe o custo da query. Cursor opaco (base64url de `created_at|id`), com
comparação de **tupla** `(created_at, id) < ($c, $id)`: um `created_at <` puro
perderia linhas com timestamp idêntico (o caso de um fan-out) e um `<=` as
repetiria. Cursor malformado é ignorado (volta à 1ª página) em vez de virar
erro — é parâmetro de navegação, e falhar ali quebraria o sino por um link
velho.

**Leitura idempotente:** `read_at = COALESCE(read_at, NOW())` — repetir o PATCH
não falha nem reescreve o instante da primeira leitura.

**BFF:** `frontend/app/api/account/notifications/[[...path]]/route.ts`. Catch-all
**opcional** (não `[...path]` como o de suporte) porque aqui a rota base sem
segmento é um endpoint real. Só GET e PATCH expostos.

---

## Frontend

`AccountNotificationsBell.tsx` substitui o `NotificationBell` estático que vivia
dentro do `AccountPanelShell` — um `<span>` decorativo, escrito de propósito sem
badge ("nada de '2' hardcoded que não significa nada"). Nada além do sino foi
tocado no shell.

| Elemento     | Comportamento                                                  |
| ------------ | -------------------------------------------------------------- |
| Badge        | escondido com 0; `1`…`99`; satura em `99+`                     |
| `aria-label` | "Notificações" / "Notificações, 1 não lida" / "…, 3 não lidas" |
| Dropdown     | abre no clique; fecha com Escape e clique fora                 |
| Empty state  | "Você ainda não tem notificações."                             |
| Loading      | "Carregando…" dentro do painel                                 |
| Error state  | "Não foi possível carregar as notificações."                   |
| Não lida     | fundo suave + ponto azul + peso da fonte                       |
| Clique       | marca como lida → navega **só** se `action_path` for interno   |
| Marcar todas | só aparece com `unreadCount > 0`                               |

**Sem polling contínuo:** contador ao montar e no foco da aba; lista só ao abrir.
Um `setInterval` multiplicaria requests por todas as abas do painel, o dia
inteiro, para um dado que muda raramente.

**O sino nunca derruba o painel.** Toda chamada é `catch`-ada; o pior caso é
ficar sem badge ou mostrar a linha de erro dentro do próprio dropdown.

---

## PF

Verificado no navegador com infraestrutura real (Postgres de teste em 5433, API
em 4000, Next em 3000). Notificações semeadas por **fixture direto no banco de
teste** — nunca por endpoint público, nunca em produção.

| Passo                        | Resultado                                                           |
| ---------------------------- | ------------------------------------------------------------------- |
| Login PF → `/dashboard`      | `h1` "Olá, E2E! 👋"                                                 |
| Badge                        | **3**                                                               |
| `aria-label`                 | "Notificações, 3 não lidas"                                         |
| Abrir dropdown               | 3 itens, todos `data-unread="true"`, "Marcar todas" visível         |
| Clicar 1 (sem `action_path`) | badge → **2**, URL inalterada                                       |
| Persistência                 | `GET /unread-count` confirma **2**                                  |
| `Cache-Control`              | `private, no-store`                                                 |
| "Marcar todas"               | badge some, `aria-label` volta a "Notificações", API confirma **0** |

## CNPJ

| Passo                             | Resultado                                                  |
| --------------------------------- | ---------------------------------------------------------- |
| Registro CNPJ → `/dashboard-loja` | `type: "CNPJ"`                                             |
| Wrapper no DOM                    | `notifications-bell-lojista` (mesmo componente, `variant`) |
| Badge                             | **1**                                                      |
| Dropdown                          | 1 item — "Sua oferta foi superada"                         |
| **Isolamento**                    | o lojista **não** vê nenhuma das 3 notificações do PF      |

## Degradação (backend inteiro derrubado)

| Verificação               | Resultado                                             |
| ------------------------- | ----------------------------------------------------- |
| Shell do painel renderiza | sim                                                   |
| Menu do lojista intacto   | sim ("Plano e cobranças" presente)                    |
| Sino presente             | sim, sem badge                                        |
| Dropdown abre             | sim, com "Não foi possível carregar as notificações." |

---

## Testes

| Comando                                  | Resultado                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `npm test` (backend)                     | **VERDE** — 187 arquivos, 2588 testes (baseline: 184 / 2482)                 |
| `npm test --prefix frontend`             | **as mesmas 5 falhas do baseline**, 2785 passando (baseline 2731)            |
| `npx tsc --noEmit`                       | VERDE                                                                        |
| `npx next lint --max-warnings 0`         | VERDE                                                                        |
| `npm run build` (frontend)               | VERDE + standalone; rota `/api/account/notifications/[[...path]]` registrada |
| `npx eslint src/modules/notifications`   | 0 erros, 0 warnings                                                          |
| Integração (`user-notifications-schema`) | **6 passando** contra PostgreSQL real                                        |

**Falhas novas: nenhuma.**

### Cobertura acrescentada — 161 casos

| Arquivo                                                           | Casos | Foco                                                 |
| ----------------------------------------------------------------- | ----- | ---------------------------------------------------- |
| `tests/notifications/notifications-validation.test.js`            | 65    | `action_path` (33 vetores), payload, limites, cursor |
| `tests/notifications/notifications-service.test.js`               | 17    | idempotência, ownership, contagem                    |
| `tests/notifications/notifications-routes.test.js`                | 24    | auth, IDOR, escopo, cache                            |
| `tests/integration/user-notifications-schema.integration.test.js` | 6     | FK, índices, corrida real, CASCADE                   |
| `frontend/lib/notifications/api.test.ts`                          | 32    | `isSafeInternalPath`, badge, tempo relativo          |
| `frontend/components/account/AccountNotificationsBell.test.tsx`   | 23    | badge, dropdown, XSS, resiliência, 2 variants        |

Os fakes de banco **implementam a semântica real** do índice único e do escopo
por destinatário. Isso é deliberado: um mock que devolve linhas fixas provaria
que o código chama o banco, não que a regra funciona. Se alguém remover o
`ON CONFLICT` ou um `WHERE recipient_user_id`, o teste vê.

### E2E

Não foi criado spec Playwright novo. O fluxo equivalente foi verificado
manualmente no navegador com infra real (seções PF e CNPJ acima), e a seção 66
do briefing pede explicitamente para não construir suíte gigantesca. Os specs
existentes (`dashboard-login-pf-pj`) continuam verdes — o shell não regrediu.

---

## Arquivos alterados

**Novos (11)**

- `src/database/migrations/049_user_notifications.sql`
- `src/modules/notifications/{constants,validation,repository,service,controller,routes}.js`
- `tests/notifications/{validation,service,routes}.test.js`
- `tests/integration/user-notifications-schema.integration.test.js`
- `frontend/app/api/account/notifications/[[...path]]/route.ts`
- `frontend/lib/notifications/api.ts` + `api.test.ts`
- `frontend/components/account/AccountNotificationsBell.tsx` + `.test.tsx`

**Modificados (2)**

- `src/app.js` — import + mount de `/api/account/notifications` antes de `/api/account`
- `frontend/components/account/AccountPanelShell.tsx` — sino estático → componente real

## Arquivos NÃO alterados

Confirmado por `git diff main...HEAD --name-only`:

- `src/modules/ads/**`, `src/modules/public/**`, `src/modules/seo/**`,
  `src/modules/payments/**`
- `src/shared/constants/status.js`
- `src/modules/auth/**` (JWT, refresh, rotação)
- `frontend/services/sessionService.ts` (`cnc_session`)
- `frontend/middleware.ts`, `frontend/app/sitemaps/**`
- `src/workers/notification.worker.js` — **morto e intocado**
- `notification_queue` — **não criada**
- Fase 0.1: `dealer.middleware.js`, `advertiser.ensure.service.js`
- Planos, Mercado Pago, migrations 001–048

---

## Débitos conhecidos

1. **O sino só existe no topo DESKTOP.** A barra mobile do
   `AccountPanelShell` não tinha sino antes e continua sem — adicioná-lo estaria
   fora de "substituir o sino estático". Decisão de produto para a próxima fase.
2. **Sem retenção.** A tabela cresce por evento. Um purge (> 180 dias, no molde
   dos 90 dias de `ad_events`) deve entrar antes do volume real.
3. **Paginação implementada, mas o dropdown não usa.** `next_cursor` é devolvido
   e o cursor está testado; o painel carrega só as 10 primeiras e não tem
   "carregar mais". Suficiente para um sino.
4. **Sem tempo real.** Contador atualiza ao montar e no foco. SSE/WebSocket
   estavam explicitamente fora de escopo.
5. **Sem canal externo.** E-mail/WhatsApp fora de escopo por decisão.
6. **`event_type` sem allowlist.** Deliberado (adicionar evento não pode exigir
   migration), mas significa que um typo grava silenciosamente.

---

## GO / NO-GO para Produto B

# GO

| Critério                                      | Status                                   |
| --------------------------------------------- | ---------------------------------------- |
| `user_notifications` criada                   | ✅                                       |
| FK `users` comprovada                         | ✅ (integração, contra PG real)          |
| Idempotency constraint criada                 | ✅                                       |
| Duplicidade idempotente não gera 2 linhas     | ✅ (8 INSERTs concorrentes → 1 linha)    |
| Listagem autenticada                          | ✅                                       |
| Unread count autenticado                      | ✅                                       |
| Mark read autenticado                         | ✅                                       |
| Read-all autenticado                          | ✅                                       |
| A nunca acessa notificações de B              | ✅ (unitário + rota + navegador)         |
| IDOR testado                                  | ✅ (404, não 403)                        |
| `action_path` seguro                          | ✅ (33 vetores + 2ª barreira no cliente) |
| Nenhum HTML arbitrário renderizado            | ✅                                       |
| Badge funciona                                | ✅                                       |
| 0 não mostra badge                            | ✅                                       |
| 99+ funciona                                  | ✅                                       |
| Dropdown funciona                             | ✅                                       |
| Empty state funciona                          | ✅                                       |
| Error state não quebra dashboard              | ✅ (verificado com backend derrubado)    |
| PF funciona                                   | ✅                                       |
| Lojista funciona                              | ✅                                       |
| Backend tests verdes                          | ✅ 2588                                  |
| Frontend sem regressões novas                 | ✅ (mesmas 5 do baseline)                |
| Typecheck verde                               | ✅                                       |
| Build verde                                   | ✅                                       |
| `ads` / SEO / payments / planos não alterados | ✅                                       |
| Auth interno não alterado                     | ✅                                       |
| Worker legado não alterado                    | ✅                                       |
| Produtos A e B não implementados              | ✅                                       |

**A caixa postal está pronta e é independente.** Os produtos poderão chamar
`createUserNotification(...)` sem que o domínio de notificações precise saber o
que é uma oferta ou um lance. A dependência é `Produtos → Notificações`, e nada
no código novo aponta na direção contrária.

### Antes do primeiro evento real do Produto B

- Definir as `idempotency_key` de cada evento (`sale_request:<id>:bid:<id>` etc.)
  — chave derivada do **estado**, nunca do relógio, senão reprocessar duplica.
- Decidir o layer de `region_memberships` para o fan-out (a cidade ativa tem
  1.932 vizinhas — registrado na Fase 0.1).
- Enfileirar a criação **dentro da mesma transação** que muda o estado do
  agregado (padrão outbox), para que notificação nunca exista sem o fato nem o
  fato sem notificação.
