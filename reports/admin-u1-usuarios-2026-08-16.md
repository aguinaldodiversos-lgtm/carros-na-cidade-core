# ADMIN U1 — TODOS OS USUÁRIOS

Data: 2026-08-16
Base: [reports/auditoria-admin-anunciantes-e-usuarios-2026-08-16.md](auditoria-admin-anunciantes-e-usuarios-2026-08-16.md)

---

## STATUS

**GO** para merge.

Um item do checklist §67 não pôde ser verificado neste ambiente (E2E/integração com Postgres real) — ver [TESTES](#testes) e [PENDÊNCIAS](#pendências). Nenhum critério foi marcado como cumprido sem evidência.

---

## REPOSITÓRIO

- **branch:** `codex/admin-u1-users-management`
- **HEAD inicial:** `086a1e4d` (`merge: phase 3.1 whatsapp visit handoff`) — `main` já atualizada (`git pull --ff-only` = "Already up to date")
- **HEAD final:** `d4eafa2f`
- **commits:**
  | hash | mensagem |
  |---|---|
  | `6e4b281a` | `feat(admin): add users management view` |
  | `e187b626` | `fix(admin): harden advertisers listing` |
  | `d4eafa2f` | `test(admin): cover users and advertiser admin flows` |
  | (este arquivo) | `docs(admin): record users management implementation` |
- **working tree:** limpo. Os dois relatórios que já estavam sem rastrear na `main` (`fase-4-0-auditoria-venda-para-lojas-2026-08-15.md` e a auditoria que originou esta fase) não foram apagados nem sobrescritos; o da Fase 4.0 fica fora desta branch, como pedido.
- **diff total:** 21 arquivos, +3.064 / −20.

> **Nota sobre o histórico:** os dois primeiros commits foram refeitos uma vez. As mensagens originais saíram com um `@` espúrio na linha de assunto (usei aspas de here-string do PowerShell dentro do Bash). Corrigi por `reset --soft` + recommit antes de qualquer push — o conteúdo dos commits é idêntico ao validado.

---

## ARQUITETURA

| | `/admin/usuarios` (novo) | `/admin/anunciantes` (preservado) |
|---|---|---|
| fonte de verdade | `users` | `advertisers` |
| endereçamento | `userId` | `advertiserId` |
| responde | "quem tem conta?" | "quem tem loja?" |
| ações | **nenhuma** (somente leitura) | status, plano, anúncios, moderação |
| cardinalidade | 1 linha por conta | 1 linha por loja (N por conta) |

**Separação:** nenhuma tela foi substituída, renomeada ou redirecionada. A tela de conta linka para `/admin/anunciantes/[advertiserId]`; a operação comercial não foi duplicada em lugar nenhum. As duas listas não são reconciliáveis numa só porque `advertisers.user_id` não tem UNIQUE — 1 conta pode ter N lojas, e uma tela única teria de mentir sobre uma das duas perguntas.

---

## BACKEND USERS

| camada | arquivo |
|---|---|
| routes | [`src/modules/admin/admin.routes.js`](../src/modules/admin/admin.routes.js) — `GET /users`, `GET /users/:id` |
| service | [`src/modules/admin/users/admin-users.service.js`](../src/modules/admin/users/admin-users.service.js) |
| repository | [`src/modules/admin/users/admin-users.repository.js`](../src/modules/admin/users/admin-users.repository.js) |
| tipo de conta | [`src/shared/account/account-type.js`](../src/shared/account/account-type.js) |
| paginação | [`src/modules/admin/admin.pagination.js`](../src/modules/admin/admin.pagination.js) |

**Endpoints criados (somente leitura):** `GET /api/admin/users` e `GET /api/admin/users/:id`.
**Não criados:** nenhum POST/PATCH/DELETE, nenhum `/block`, `/reset-password`, `/impersonate` ou `/promote-admin`. Há teste que falha se qualquer verbo de escrita passar a responder.

`GET /users/:id/activity` **não** foi criado: o service monta o detalhe com cinco queries em `Promise.all`, e um endpoint extra só acrescentaria um round-trip sem simplificar nada.

---

## QUERY USERS

```sql
SELECT u.id, u.name, u.email, u.role, u.document_type,
       u.plan_id, u.email_verified, u.is_email_verified,
       u.locked_until, u.created_at,
       p.name AS plan_name
FROM users u
LEFT JOIN subscription_plans p ON p.id = u.plan_id
[WHERE ...]
ORDER BY u.created_at DESC NULLS LAST, u.id DESC
LIMIT $n OFFSET $m
```

- **FROM:** `users` — uma linha por conta, sempre.
- **JOIN:** apenas `subscription_plans` (1:1, só para o nome do plano). **Nenhum** join com `advertisers`, `ads`, `purchase_intents` ou `purchase_intent_offers`.
- **WHERE:** construído **uma única vez** em `buildUserFilters()` e usado pelas duas consultas. Filtros: busca (`name`/`email` ILIKE + `id` exato quando o termo é inteiro), `account_type` e `role`.
- **ORDER:** `created_at DESC NULLS LAST, id DESC` — o desempate por `id` é obrigatório.
- **LIMIT/OFFSET:** clamp em `[1, 100]`, default 30; offset ≥ 0.
- **COUNT:** `SELECT COUNT(*)::int FROM users u ${where}` com os mesmos params.

**Invariante declarada e testada:** nenhuma condição do WHERE pode referenciar o alias `p` — a query de contagem não tem esse JOIN. Se um filtro por nome de plano for adicionado no futuro, o teste falha e força a decisão consciente de juntar também no count. É a prevenção estrutural contra o defeito de `countQuery` que apareceu nos filtros da Fase 3.

---

## PII

**Colunas selecionadas:** `id`, `name`, `email`, `role`, `document_type` (só para derivar o tipo — **não** vai ao payload), `plan_id`, `email_verified`, `is_email_verified`, `locked_until`, `created_at`, `subscription_plans.name`.

**Explicitamente excluídas:** `password`, `password_hash`, `reset_token`, `reset_token_expires`, `email_verification_token`, `email_verification_expires`, `document_number`, `address`, `phone`, `whatsapp`, `failed_attempts`.

Duas barreiras independentes:

1. **Query** — lista literal de colunas, sem `SELECT *`. Teste inspeciona o SQL emitido.
2. **DTO** — `toUserDto` monta um objeto novo campo a campo, **sem spread**. Um `{...row}` transformaria qualquer coluna nova em campo público sem ninguém decidir isso; é o erro que um refactor futuro tende a introduzir, e o teste parte de uma linha propositalmente poluída com hash de senha, tokens e CPF para provar que não vaza.

O teste verifica que a **chave não existe** (`hasOwnProperty === false`), não que o valor é `undefined`, e que nenhum valor secreto aparece no JSON serializado — inclusive no payload HTTP real da rota.

**E-mail completo** é exibido, como na tela de anunciantes: é a ferramenta legítima de localizar contas. O que não acontece é enviar PII adicional só porque o admin tem permissão.

---

## LISTAGEM

- **colunas:** ID · NOME · EMAIL · TIPO · PAPEL · PLANO · CADASTRO
- **não incluídas, por não existirem no schema:** STATUS (`users` não tem status), ÚLTIMO ACESSO (não há `last_login` nem tabela de tentativas de login), CIDADE (`users.city` é texto livre, sem FK — a Fase 0.1 removeu deliberadamente qualquer decisão baseada nele)
- **sinalizações inline, derivadas de dado real:** "Bloqueio temporário" só quando `locked_until > NOW()` (o backend devolve `null` para trava vencida) e "não verificado" quando o e-mail não foi confirmado. Nenhum badge "Ativo".
- **busca:** server-side real, por `name`, `email` e ID exato. Placeholder "Nome, e-mail ou ID" — não promete documento, e `document_number` não entra no SELECT. Termo parametrizado, com curingas de LIKE escapados.
- **filtros:** Tipo (Todos / Pessoa física / Lojista-CNPJ / Pendente) e Papel (Todos / Usuário / Admin). Valor fora do vocabulário fechado vira 400 sem tocar o banco.
- **filtro de plano:** não implementado (§15 — fica para a U2). A **coluna** PLANO, essa sim, vem de `users.plan_id`.
- **paginação:** offset/limit, 30 no frontend, teto no backend.

---

## DETALHE

- **identidade:** nome, e-mail, tipo, papel, plano efetivo, e-mail verificado, data de cadastro e bloqueio temporário (só se vigente).
- **atividade** (queries separadas em `Promise.all`, nenhum contador persistido em `users`):
  - lojas vinculadas — `COUNT` sobre as linhas de `advertisers`
  - anúncios ativos e totais — `WHERE advertiser_id IN (SELECT id FROM advertisers WHERE user_id = $1)`; **subquery, não JOIN**, que é o que impede contar cada anúncio duas vezes quando a conta tem duas lojas
  - procuras — total e "vivas" (`status='active' AND expires_at > NOW()`, porque a expiração é lazy e ninguém muda o status quando o prazo vence)
  - veículos recebidos — `purchase_intent_offers` ligados às procuras **do comprador** (via `purchase_intent_id → buyer_user_id`), não via `dealer_user_id`, que responderia a outra pergunta
- **advertisers:** tabela com **todas** as lojas (0, 1 ou N), cada uma com nome, cidade resolvida por `advertisers.city_id → cities`, status e botão "Gerenciar anunciante" → `/admin/anunciantes/[advertiserId]`. Status NULL/`''` é apresentado como `active`, seguindo a convenção do resto do produto.
- **purchase intents:** lista compacta das 5 últimas (veículo, cidade, status, data). A seção some quando não há nenhuma.
- **offers:** apenas o contador, como pedido — nenhum card da Fase 3 foi reimplementado aqui.
- **Venda para Lojas:** nada. `sale_requests` não existe (última migration é a 051), e há teste que falha se aparecer um contador com esse nome.

---

## ADMIN ANUNCIANTES — HARDENING

| item | antes | depois |
|---|---|---|
| **busca** | UI montava `search`, backend descartava | busca real em `adv.name`, `adv.email`, `adv.company_name`, `u.email`; placeholder passa de "Nome, email ou documento" para "Nome, e-mail ou empresa"; **a query de contagem ganhou o `LEFT JOIN users`** que a cláusula exige |
| **plano** | `advertisers.plan` (snapshot congelado na criação) | `users.plan_id → subscription_plans` via LEFT JOIN 1:1 — sem N+1, 2 queries no total; lista e detalhe deixam de discordar |
| **status legado** | `adv.status = $1` cru | `COALESCE(NULLIF(BTRIM(adv.status), ''), 'active')` — mesma regra de `advertiserIsOperational` |
| **ordenação** | `created_at DESC NULLS LAST` | `created_at DESC NULLS LAST, adv.id DESC` |
| **limit** | `parseIntParam(..., 50)`, aceitava 0 e 999999 | mesma política de `/admin/users` (clamp 1–100) |

**Não tocado (dívida registrada):** a coluna ANÚNCIOS continua contando só `active`, com o fallback `?? total_ads_count` morto. Decidir se ela significa "ativos" ou "histórico" é decisão de produto.

---

## MENU MOBILE

**Mudança** ([`AdminTopbar.tsx`](../frontend/components/admin/AdminTopbar.tsx)) — mínima e local, sem sidebar nem hambúrguer:

- `nav` passa a ser a única região rolável: `overflow-x-auto` + `min-w-0` + `flex-1` (sem `min-w-0` o flex item nunca encolhe e o `overflow-x` nunca ativaria);
- cada item ganha `shrink-0` + `whitespace-nowrap` (itens flex têm `min-width: auto` e não encolhem abaixo do texto — era isso que estourava o container);
- `header` ganha `overflow-hidden`, para o scroll do nav não arrastar o body;
- `px-3 → px-2.5` e `gap-1 → gap-0.5`: com o 15º item os rótulos somavam **1203px numa faixa de 1149px** em 1440, e "Configurações" ficaria cortado no desktop. Com o ajuste são 1115px — 34px de folga;
- o wordmark "Carros na Cidade" vira `hidden sm:inline` (o ícone continua sendo o link): em 360px ele consumia ~120px e deixava a faixa do nav com 148px.

**Medição real.** O admin exige sessão autenticada, então não é possível abrir `/admin/usuarios` no navegador sem credenciais. Montei um harness servido pelo próprio dev server (`frontend/public/`, removido antes do commit — confirmado por `git status`) com a **CSS compilada do build** e a **marcação exata** do topbar, da barra de filtros e da tabela, e medi `document.body.scrollWidth` contra `clientWidth`:

| largura | body overflow | faixa do nav | nav rola | tabela rola |
|---|---|---|---|---|
| **360×640** | **não** (360/360) | 228px (era 148px antes de esconder o wordmark) | sim | sim |
| **390×844** | **não** (390/390) | — | sim | sim |
| **412×915** | **não** (412/412) | — | sim | sim |
| **768×1024** | **não** (768/768) | — | sim | não (cabe) |
| **1440×900** | **não** (1440/1440) | 1149px / conteúdo 1115px | não precisa | não |

Verificado também que em 360px o item "Usuários" é alcançável por rolagem e fica **inteiramente visível**, e que em 1440px o **último** item cabe sem corte. Screenshots em 360 e 1440 conferidos.

O que o harness prova é o comportamento da CSS real com a marcação real. O que ele não substitui é a página autenticada de verdade — registrado em [PENDÊNCIAS](#pendências).

---

## AUTH

Nenhum guard novo foi criado; as três camadas existentes já cobrem a rota nova.

- **layout:** [`frontend/app/admin/layout.tsx`](../frontend/app/admin/layout.tsx) → `requireAdminSession()`, `dynamic = "force-dynamic"`, `robots: noindex`. `/admin/usuarios` herda por ser filha de `/admin`.
- **BFF:** o catch-all [`app/api/admin/[...path]/route.ts`](../frontend/app/api/admin/[...path]/route.ts) já cobre `/api/admin/users` **sem nenhuma alteração** — nenhuma rota BFF nova foi criada, como pedido.
- **backend:** `router.use(authMiddleware); router.use(requireAdmin());` aplicados ao router inteiro antes de qualquer rota. Testado: usuário comum → **403**, sem sessão → **401**, admin → **200**, nas duas rotas, e o repositório não é chamado nos casos negados.

---

## TESTES

Baseline registrado **antes** de qualquer alteração e comparado ao final.

| suíte | baseline | final | delta |
|---|---|---|---|
| **backend** (excl. integração com DB) | 371 testes em admin+account, verdes | **199 arquivos / 2.978 testes, 0 falhas** | +5 arquivos, +59 testes |
| **backend — integração DB** | não executável | **12 arquivos falham** — 182× `ECONNREFUSED` | inalterado |
| **frontend** | 195 arquivos / 2.989 testes / 3 arquivos e 6 testes falhando | **199 arquivos / 3.029 passam / 5 falhas** | +4 arquivos, +45 testes, **0 falhas novas** |
| **typecheck** | limpo | **limpo** | — |
| **lint** (`next lint`) | limpo | **limpo** | — |
| **build** (`next build`) | — | **Compiled successfully**; `/admin/usuarios` (3,27 kB) e `/admin/usuarios/[id]` (3,31 kB) presentes | — |

**Falhas pré-existentes, não relacionadas e não corrigidas** (idênticas ao baseline, nome por nome):
- `app/carros-usados/regiao/[slug]/page.config.test.ts` — 3 testes de flags `REGIONAL_PAGE_INDEXABLE` / `CANONICAL_SELF`
- `app/seguranca/page.copy.test.ts` — 2 testes de copy da página de segurança

**Integração com Postgres não executada.** Docker Desktop não está em execução e o Postgres de teste (`127.0.0.1:5433`, `docker-compose.test.yml`) está inacessível; a instância local na 5432 recusa a credencial. As 12 falhas são exclusivamente de conexão. Consequência direta para esta fase: os testes §43–§46 e §51 foram escritos no nível de **service + rota com o driver mockado**, e o E2E de admin (§55) **não foi criado**. O que isso cobre e o que não cobre está em [PENDÊNCIAS](#pendências).

**Testes novos — 5 backend, 4 frontend:**

| arquivo | testes | foco |
|---|---|---|
| `tests/admin/admin-users-account-type.test.js` | 21 | tabela de derivação caso a caso (inclusive `'rg' → pending`); compatibilidade com `isDealerAccount`; predicados SQL |
| `tests/admin/admin-users-repository.test.js` | 20 | PII no SQL; ORDER BY com desempate; WHERE idêntico entre dados e contagem em 6 combinações; escape de LIKE; subquery em vez de JOIN |
| `tests/admin/admin-users-service.test.js` | 19 | chaves de PII inexistentes; DTO; os 4 cenários de conta invisível; validação; 404 |
| `tests/admin/admin-users-routes.test.js` | 22 | 401/403/200; clamp de paginação; filtros inválidos → 400; id não numérico → 400; ausência de verbos de escrita |
| `tests/admin/admin-advertisers-listing.test.js` | 15 | busca real; JOIN no count; status legado; plano efetivo; ordenação; paginação |
| `frontend/app/admin/usuarios/page.test.tsx` | 17 | conta sem anúncio aparece; admin aparece; sem colunas inventadas; busca e filtros chegam ao backend; paginação; navegação |
| `frontend/app/admin/usuarios/[id]/page.test.tsx` | 14 | N lojas listadas; conta sem loja; ausência de ação comercial; sem bloco falso da Fase 4 |
| `frontend/app/admin/anunciantes/page.test.tsx` | 5 | placeholder honesto; `search` enviado; PLANO efetivo |
| `frontend/components/admin/AdminTopbar.test.tsx` | 9 | posição de "Usuários"; item ativo sem vazamento por prefixo; contrato de classes do scroll |

---

## MIGRATIONS

**Nenhuma.** Como previsto no §39: nada de `users.status`, `users.last_login`, `users.city_id`, `users.is_test`, índice novo ou UNIQUE em `advertisers.user_id`. Nenhum requisito da fase exigiu alteração de schema.

---

## PROTECTED DOMAINS

Nenhum arquivo de `/comprar`, `/carros-em/*`, `/carros-usados/*`, SEO, canonical, robots, sitemap, payments, Mercado Pago, regras de planos/assinaturas, ads públicos, fluxo de publicação, `advertiser.ensure.service.js`, regras de Compradores Ativos, `purchase_intents`, `purchase_intent_offers`, WhatsApp Fase 3.1, notificações, Fase 4 ou workers foi tocado. `purchase_intents` e `purchase_intent_offers` são apenas **lidos** (contagem e listagem), nunca escritos.

**Diff fora da lista prevista no §63 — dois arquivos, justificados:**

1. **`src/shared/account/account-type.js`** (novo). O §63 previa `src/modules/admin/users/*`, mas a derivação de tipo de conta **não pertence ao admin**: ela precisa concordar com `buildSessionUser`, que alimenta a autorização de lojista. Colocá-la dentro do módulo admin criaria exatamente a "segunda função incompatível" que o §8 proíbe. Ela **reexporta** `ACCOUNT_TYPE` de `dealer.middleware.js` em vez de duplicar o vocabulário.
2. **`src/modules/admin/admin.pagination.js`** (novo). O §36 manda aplicar a mesma política de limite aos dois endpoints; um helper compartilhado é a única forma de "mesma política" não virar duas cópias que divergem.

---

## PENDÊNCIAS

| # | item | por quê |
|---|---|---|
| 1 | **E2E de admin (§55) não criado** e cenários §43–§46/§51 provados só com driver mockado | Postgres de teste inacessível (Docker parado). O que está provado: a query não junta `advertisers` (logo não pode excluir quem não tem loja), o SQL tem o desempate de ordenação, e o service devolve uma linha por conta com os contadores corretos. O que **não** está provado contra um banco real: o plano de dados end-to-end. Rodar `docker compose -f docker-compose.test.yml up -d` e repetir a suíte fecha isso. |
| 2 | **`buildSessionUser` mantém cópia privada da derivação de tipo de conta** | Unificar exige mexer em `auth.service.js`, que **não tem suíte de teste dedicada** (`tests/auth/` não existe). Trocar código de autenticação sem rede de proteção é risco desproporcional numa fase de leitura. `admin-users-account-type.test.js` fixa a tabela de casos até lá. Commit próprio, com cobertura de auth antes. |
| 3 | **Contagem de ANÚNCIOS em `/admin/anunciantes`** | Só conta `active`; o fallback `?? total_ads_count` é código morto (`COUNT` nunca é `null`). Decisão de produto, deixada fora do escopo por §37. |
| 4 | **`src/services/advertiser.service.js#getOrCreateAdvertiser`** | Código morto que insere advertiser sem `user_id`, `city_id` nem `slug`. Não removido por §38 — merece mudança separada. |
| 5 | **Divergência transitória de plano na lista de anunciantes** | Concessão manual vencida e ainda não varrida aparece como plano concedido. Isso é **coerente** com o que a conta de fato tem (`resolveCurrentPlan` lê o mesmo `users.plan_id`); abrir o detalhe dispara o sweep lazy e as duas telas convergem. Inerente à expiração lazy, não a esta leitura. |
| 6 | **Sem índice em `users.created_at`** | É o `ORDER BY` da nova listagem. Por §40 nenhum índice especulativo foi criado — registrado para observação quando o volume crescer. |
| 7 | **Contas de teste aparecem, sem rótulo** | Por §41, nada foi ocultado. Não há como distingui-las por dado (não existe `is_test`; a única marca é a convenção de e-mail do `e2e-seed`). Filtro explícito fica para depois. |
| 8 | **Dashboard admin inalterado** | Por §58, nenhum KPI ou card foi mexido. Um card de usuários fica para a U2. |

---

## VEREDITO

**GO** para merge.

Checklist §67 — todos os itens verificados, com a ressalva do item 1 das pendências:

✅ `/admin/usuarios` existe · usa `FROM users` · todos os usuários aparecem · usuário sem advertiser aparece · comprador ativo sem advertiser aparece · admin aparece · user com 2 advertisers aparece uma única vez · nenhum `SELECT * FROM users` · nenhum segredo no payload · `document_number` fora do payload · `account_type` canônico · nenhum status "Ativo" inventado · nenhum último acesso inventado · cidade fraca não apresentada como verdade territorial · plano usa `users.plan_id` · busca funciona · busca afeta o count · paginação com teto · paginação determinística · detalhe carrega atividade separadamente · advertiser continua endereçado por `advertiserId` · `/admin/anunciantes` continua existindo · busca de anunciantes funciona · plano da lista não diverge do detalhe · filtro `active` canônico · nenhuma ação de advertiser duplicada · menu funciona em mobile · sem overflow horizontal do body · zero migration · Fase 4 intacta · Produto 1 intacto · catálogo público intacto · pagamentos intactos · auth intacta · testes novos verdes · nenhuma regressão nova · typecheck verde · lint verde · build verde.

Branch entregue para revisão. **Sem merge e sem deploy.**
