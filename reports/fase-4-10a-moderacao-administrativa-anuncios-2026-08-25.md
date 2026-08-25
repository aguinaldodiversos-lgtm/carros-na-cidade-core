# Fase 4.10A — Moderação administrativa de anúncios

**Data:** 2026-08-25
**Branch:** `codex/admin-ad-moderation`
**Base:** `3ade27a603258fed6b46e4bd70ccba510b60cb28` (main após Fase 4.9B)

---

## 1. Resumo executivo

O bloqueio administrativo **já existia parcialmente** na main: o status `blocked`
está no enum canônico desde a migration 030, as colunas `blocked_reason` /
`blocked_at` desde a 014, e o painel admin já tinha botões "Bloquear" /
"Desbloquear". A auditoria mostrou que a camada de leitura pública está 100%
limpa — toda query filtra `status = 'active'`.

O que **não** existia era o que torna esse bloqueio uma capacidade administrativa
confiável:

| Lacuna encontrada | Consequência antes desta fase |
| --- | --- |
| Motivo não era obrigatório no backend | `curl` bloqueava sem motivo nenhum |
| Nenhum código estável de motivo | Só texto livre, sem chave de domínio |
| "Desbloquear" forçava `active` | Um anúncio **pausado** voltava PÚBLICO ao ser reativado |
| Sem idempotência | Retry duplicava a trilha e recarimbava a data |
| Sem trilha de moderação | Nenhum histórico de bloqueio/reativação na tela |
| Cache não era invalidado | Bloqueio não derrubava o cache do backend |
| Sem transação/lock | Bloquear × reativar simultâneos decidiam sobre estado obsoleto |
| **Anúncio bloqueado sumia do painel do dono** | O anunciante via o anúncio evaporar, sem explicação |

Todas foram fechadas. A modelagem **reutiliza `ads.status`** (não cria flag
paralela) e acrescenta três colunas aditivas para preservar o estado anterior, o
código do motivo e a autoria.

**GO/NO-GO: GO**, com duas dívidas registradas (§18) — nenhuma bloqueante.

---

## 2. Git

```
Branch .......... codex/admin-ad-moderation
Base ............ 3ade27a603258fed6b46e4bd70ccba510b60cb28
Arquivos ........ 40 (24 modificados/criados de código, 6 de teste, 10 screenshots)
Diff ............ +3778 / -42
Ahead/behind .... ver §19
```

Arquivos protegidos do usuário **não foram tocados** (permanecem untracked):
`frontend/public/images/lojista-detalhe-veiculo-referencia.png`,
`lojista-oportunidades-veiculos-referencia.png`, `vender-para-loja.png`,
`reports/fase-4-0-auditoria-venda-para-lojas-2026-08-15.md`.

Nenhum `git add .`, `git add -A`, `git clean`, `git stash -u` ou `git reset --hard`
foi usado.

---

## 3. Auditoria do lifecycle

### Status reais encontrados

`src/shared/constants/status.js` define 10 valores em `AD_STATUS`. O CHECK do
banco (`ads_status_check`) aceita **7** — a 030 fixou 6 e a 032 acrescentou
`archived`:

| Status | No CHECK | Caminho de escrita real |
| --- | --- | --- |
| `active` | sim | publicação, activate do dono, aprovação de moderação |
| `pending_review` | sim | pipeline antifraude retém o anúncio |
| `paused` | sim | pausa do dono; admin via PATCH status |
| `rejected` | sim | admin rejeita na fila de moderação |
| `blocked` | sim | **esta fase** (antes: PATCH status genérico) |
| `deleted` | sim | soft-delete do dono e do admin |
| `archived` | sim | limpeza operacional (Fase 3.5) |
| `draft` / `sold` / `expired` | **não** | definidos no enum, sem caminho de escrita |

A allowlist de publicidade já era explícita e é o que esta fase reutiliza:

```js
export const AD_STATUS_PUBLIC = Object.freeze([AD_STATUS.ACTIVE]);
```

### Infraestrutura preexistente reaproveitada

- `admin_actions` (014) — auditoria administrativa genérica
- `ad_moderation_events` (025) — trilha append-only de moderação
- `ads.blocked_reason`, `ads.blocked_at` (014)
- `invalidateAdsCachesAfterMutation()` — já usado pela fila de moderação

---

## 4. Modelagem escolhida e por quê

**Reutilizar `ads.status = 'blocked'`** + três colunas aditivas.

### Por que não uma flag paralela (`is_blocked`)

A tabela `ads` é lida por ~106 consultas. Uma flag separada obrigaria cada
superfície pública a lembrar de `status='active' AND is_blocked=false`, e a
primeira que esquecesse vazaria o anúncio. Reutilizar o status mantém **um**
ponto de verdade e torna o vazamento impossível por construção, não por
disciplina — nenhuma query pública precisou ser alterada nesta fase.

### Por que guardar o estado anterior

Este era o defeito mais sério do fluxo antigo. "Desbloquear" chamava
`changeStatus(active)`, então:

```
ad pausado pelo dono → admin bloqueia → admin reativa → ad fica PÚBLICO
```

O desbloqueio publicava um anúncio que o próprio dono havia tirado do ar, e o
mesmo valia para `pending_review` (a reativação pulava a fila antifraude).
`blocked_previous_status` transforma a reativação em **restauração**: o
bloqueio remove a sanção administrativa e nada mais.

### Regra de domínio

```
PUBLICAMENTE_VISÍVEL(ad) ⟺ ad.status === 'active'
```

Bloquear é `status := 'blocked'`, o que remove o anúncio de todas as superfícies
de uma vez. Reativar é `status := blocked_previous_status`, o que devolve o
anúncio ao regime em que ele estava — sem ignorar nenhum outro portão.

---

## 5. Migration

`src/database/migrations/062_ads_admin_moderation_block.sql`
(a última era a 061; número real conferido antes de criar).

| Coluna | Tipo | Papel |
| --- | --- | --- |
| `blocked_reason_code` | TEXT | Código estável do motivo |
| `blocked_previous_status` | TEXT | Estado a restaurar na reativação |
| `blocked_by_user_id` | TEXT | Admin que bloqueou (**uso interno**) |

`blocked_reason` (014) passa a ser a observação administrativa livre;
`blocked_at` continua sendo o carimbo de tempo.

**Backfill:** linhas já em `blocked` sem código recebem `other` +
`previous_status='active'` — o caminho antigo só oferecia "Desbloquear → active",
então isso preserva exatamente o comportamento que essas linhas já teriam.

**Constraint:**

```sql
CHECK (status <> 'blocked' OR blocked_reason_code IS NOT NULL) NOT VALID
```

`NOT VALID` de propósito: valida toda linha nova ou atualizada sem varrer a
tabela existente (deploy-safe) e sem falhar se algum legado escapar do backfill.
Promover a `VALID` numa migration futura, depois de confirmar zero violações em
produção.

**Aplicada e verificada** no Postgres de teste: colunas criadas, constraint
presente com `convalidated = f`, e o teste "aplica migrations em banco novo do
zero" segue verde.

---

## 6. Mapa das superfícies públicas

Auditado por conteúdo (não por memória) e **exercitado em tempo de execução**
por `tests/public/blocked-ad-no-public-leak.test.js`, que chama cada função real
contra um banco falso e inspeciona o SQL emitido.

| Superfície | Arquivo | Guard | Vaza? |
| --- | --- | --- | --- |
| Catálogo `/comprar` + busca | `ads-filter.builder.js` | `a.status = 'active'` na base | não |
| Contagem/paginação | mesmo builder (`countQuery`) | idem | não |
| Facetas | `ads-filter.facets.js` | `buildAdsFacetWhere` (base active) | não |
| Autocomplete marcas/modelos | `ads-autocomplete.repository.js` | active | não |
| Autocomplete cidades | idem | não lê `ads` (catálogo IBGE) | n/a |
| Cidade (snapshot, destaques, oportunidades, recentes, facetas) | `city-public.repository.js` | active nas 8 queries | não |
| Região (estoque da âncora) | `regional-radius.repository.js` | active | não |
| Região (vizinhança) | idem | não lê `ads` (`region_memberships`) | n/a |
| Cluster territorial | `territorial-cluster.repository.js` | active | não |
| Loja `/lojas/[slug]` | `dealers.repository.js`, `public-dealer.service.js` | active | não |
| Diretório de lojas | `listTopDealersByCitySlug` | active | não |
| Detalhe `/veiculo/[slug]` | `ads.repository.findAdByIdentifier` | `AND a.status = $2` (ACTIVE) | não |
| Sitemap veículos | `sitemap-ads.repository.js` | active | não |
| Sitemaps territoriais (cidade, marca, modelo, abaixo-FIPE) | `territorial-inventory-sitemap.repository.js` | active | não |
| Conjunto de cidades públicas | `public-city-set.service.js` | delega ao sitemap territorial | não |

O teste falha se uma superfície **não emitir consulta nenhuma** — sem isso, um
import quebrado ou uma assinatura mudada faria a varredura passar vazia e ser
lida como "não vaza".

---

## 7. Endpoints e autorização

| Método | Rota | Efeito |
| --- | --- | --- |
| PATCH | `/api/admin/ads/:id/block` | Bloqueia. `reason_code` obrigatório, `note` opcional |
| PATCH | `/api/admin/ads/:id/unblock` | Reativa restaurando o estado anterior |
| GET | `/api/admin/ads/:id/moderation-history` | Trilha de bloqueio/reativação |

Autorização **herdada** do router admin (`router.use(authMiddleware)` +
`router.use(requireAdmin())`) — nenhuma lógica paralela foi criada. Coberto por
teste:

| Ator | Resultado |
| --- | --- |
| Não autenticado | 401 |
| Pessoa física (CPF) | 403 |
| Lojista (CNPJ) | 403 |
| Admin | 200 |

### A via genérica foi fechada

`PATCH /api/admin/ads/:id/status` agora **recusa** `blocked` como alvo e recusa
tirar um anúncio de `blocked`. Sem isso, as garantias de motivo obrigatório e
estado preservado seriam decorativas: bastaria chamar a rota antiga para
contorná-las. Dois testes travam esse fechamento.

---

## 8. Idempotência

Bloquear um anúncio já bloqueado devolve **200 com `changed: false`** —
não grava segundo evento, não recarimba `blocked_at` e **não sobrescreve o motivo
original**. Reativar um anúncio não-bloqueado idem. Um retry de rede não
reescreve a história.

Verificado contra banco real: após o segundo bloqueio com motivo diferente, o
`blocked_reason_code` continua sendo o do primeiro e existe **um** evento.

---

## 9. Audit trail

Duas trilhas, ambas append-only:

- **`ad_moderation_events`** — gravado **dentro da transação**. Se o INSERT
  falhar, o bloqueio inteiro faz rollback: um anúncio bloqueado sem registro de
  quem bloqueou e por quê é pior do que um bloqueio que não aconteceu.
- **`admin_actions`** — `block_ad` / `unblock_ad`, best-effort (nunca lança, por
  design do helper existente).

Bloqueio e reativação são **eventos distintos**. Reativar não atualiza o evento
de bloqueio — acrescenta um novo. Provado no teste de integração: após a
reativação, a linha do bloqueio tem o **mesmo id** de antes.

Campos registrados: `ad_id`, `event_type`, `actor_user_id`, `actor_role`,
`from_status`, `to_status`, `reason` (código), `metadata` (código + nota +
estado restaurado), `created_at`.

---

## 10. UI administrativa

Adições pequenas, sem redesenhar o painel:

- Botão **"Bloquear anúncio"** (some em `blocked` e `deleted`)
- Botão **"Reativar anúncio"** (só em `blocked`)
- **Faixa de bloqueio** com motivo, data e nota interna
- **"Histórico de moderação"** na coluna lateral, com scroll (`max-h-60`, mesmo
  padrão de "Eventos Recentes")
- Badge `BLOQUEADO` e filtro por status na listagem: **já existiam**

O modal exige motivo, abre **sem motivo pré-selecionado** (um clique distraído
não pode gravar "Informação incorreta" numa trilha permanente) e exige descrição
quando o motivo é "Outro motivo".

Os botões "Ativar" e "Pausar" somem em `blocked` — o backend recusa essa via, e
um botão que só produz erro é pior que a ausência dele.

`AdminActionDialog` ganhou uma prop `confirmDisabled`. Sem ela, travar o confirm
por falta de motivo exigiria `requireReason`, que exibe "Motivo obrigatório."
logo abaixo de um campo rotulado "(opcional)" — o oposto do que vale.

---

## 11. UI do anunciante

**O achado mais importante desta fase.** `listOwnedAds` não incluía `blocked`, e
`AD_STATUS_OWNER_HISTORY` também não — o anúncio bloqueado **sumia por completo**
do painel do dono, sem explicação nenhuma.

Corrigir isso exigiu **quatro pontas da cadeia**, não uma:

1. `listOwnedAds` — incluir `blocked` na query
2. `getDashboardPayload` — o payload era recomposto de `activeAds`/`pausedAds`,
   e descartava o bloqueado **depois** de ele ter sido corretamente lido do
   banco. Nova lista `blocked_ads`
3. `normalizeDashboardPayload` (BFF) — a regra era binária (`paused` ou, para
   todo o resto, `active`), então o bloqueado chegaria ao card **rotulado como
   ativo**. Substituída por allowlist de status conhecidos
4. `AccountDashboardView` / `AdCard` / `AdsPremiumList` — render

O dono agora vê:

- Badge **Bloqueado** (não "Pausado", não "Ativo")
- "Este anúncio foi temporariamente bloqueado pela administração do Carros na Cidade."
- Motivo no rótulo **destinado a ele**
- "Entre em contato com o suporte caso precise de mais informações."
- **Nenhuma ação**: sem Ativar, sem Impulsionar, sem Editar, sem menu

Bloqueados aparecem **primeiro** na lista: é o único estado que o dono não
provocou e que exige uma ação dele.

`stats.active_ads` **não** conta bloqueados — o limite do plano continua correto.

---

## 12. Privacidade

O catálogo tem **dois rótulos por motivo**:

| Código | Admin lê | Anunciante lê |
| --- | --- | --- |
| `suspected_fraud` | "Possível fraude" | "Informações do anúncio precisam ser verificadas." |
| `invalid_photos` | "Fotos inadequadas ou incompatíveis" | "As fotos do anúncio precisam ser revisadas." |
| `other` | "Outro motivo" | "Este anúncio está em revisão pela administração." |

Uma acusação de fraude exibida ao dono como tal seria uma imputação que a
plataforma ainda não apurou. Ele precisa saber **o que revisar**, não receber um
veredito.

O rótulo do anunciante é resolvido **no servidor** (`blocked_message` vem
pronto). Traduzir no cliente significaria que qualquer descuido renderizaria o
rótulo interno na tela errada.

Verificado no payload real do dono: **não** contém `blocked_reason` (nota
interna), `blocked_by_user_id`, nem o código cru. O DTO do histórico admin
também omite `actor_user_id`.

---

## 13. Edição, publicação e renovação não removem o bloqueio

Todos os caminhos do dono foram exercitados (`tests/ads/blocked-ad-owner-cannot-bypass.test.js`):

| Ação do dono | Resultado |
| --- | --- |
| Editar preço / descrição / fotos | **409** — nada é gravado |
| Enviar `status` no corpo da edição | **400** — antes de qualquer leitura |
| `activate` | **410** |
| `pause` | **410** |
| Opções de publicação / renovar | **410** |
| Impulsionar (boost) | recusado (`AD_STATUS_CAN_RECEIVE_BOOST` = só `active`) |

Confirmado também no E2E, com chamadas diretas à API depois do bloqueio: o
anúncio continua `blocked` após todas as tentativas.

Fila de moderação (`approve`/`reject`/`request-correction`) exige
`pending_review`, então também não desbloqueia.

---

## 14. Cache

`blockAd` e `unblockAd` chamam `invalidateAdsCachesAfterMutation()` — a fila de
moderação já fazia isso; o bloqueio não fazia. Isso limpa o cache do **backend**
(busca, facetas, autocomplete, cidade, home) imediatamente.

**Janela medida em ambiente real:**

| Superfície | Some em |
| --- | --- |
| Detalhe `/veiculo/[slug]` | **imediato** (404) |
| API pública do anúncio | **imediato** |
| Catálogo de cidade | ~60s (`revalidate: 60` do fetch cache do Next) |

O detalhe é o que importa mais: é a URL indexada e a que alguém pode ter salvo,
e ela não depende de expiração de cache nenhuma.

Os ~60s do catálogo são o `revalidate` do Next, que vive no processo do frontend
— não há hoje webhook de `revalidateTag` ligando backend e ISR (o próprio
`ads.mutation-cache.js` já registrava isso como pendência). **Não são horas**, e
a janela se limpa sozinha. Ver dívida em §18.

O E2E assere essa janela com teto de 90s: se alguém elevar o `revalidate` para
300 ou 3600, o teste quebra em vez de deixar passar.

---

## 15. Concorrência

`SELECT ... FOR UPDATE` na linha do anúncio, dentro de `withTransaction`. O
segundo a chegar lê o estado **já gravado** pelo primeiro e cai no ramo de
idempotência, em vez de decidir sobre estado obsoleto.

Testado contra Postgres real, com conexões distintas:

| Cenário | Resultado |
| --- | --- |
| bloquear × bloquear | exatamente 1 muda, 1 evento |
| reativar × reativar | exatamente 1 muda |
| bloquear × reativar | estado final **bate com o último evento** da trilha |
| 3 bloqueios simultâneos | anúncio bloqueado, fora da busca |

A invariante testada não é "o primeiro vence" (a ordem é do banco), e sim: se o
anúncio terminou bloqueado, o motivo está preenchido e ele não aparece
publicamente — nunca termina público com um bloqueio válido tendo vencido.

---

## 16. Testes

### Novos

| Arquivo | Testes | Cobre |
| --- | --- | --- |
| `tests/admin/admin-ad-block.service.test.js` | 29 | motivo obrigatório, estado anterior, restauração, idempotência, trilha, cache, lock |
| `tests/admin/admin-ad-block-routes.test.js` | 15 | autorização (401/403/200), contrato, DTO sem identidade do admin |
| `tests/admin/ad-block-reasons-sync.test.js` | 8 | sincronia backend↔frontend do catálogo, rótulo brando ao dono |
| `tests/public/blocked-ad-no-public-leak.test.js` | 31 | varredura de todas as superfícies públicas, com prova de alcance |
| `tests/ads/blocked-ad-owner-cannot-bypass.test.js` | 13 | edição/publicação/boost não reativam |
| `tests/integration/ad-admin-moderation.integration.test.js` | 19 | **banco real**: constraint, preservação de dados, concorrência |
| `frontend/components/admin/AdBlockDialog.test.tsx` | 11 | modal, motivo, descrição, loading, erro |
| `frontend/components/admin/AdModerationHistory.test.tsx` | 7 | dois eventos, sem identidade do admin |
| `frontend/components/dashboard/AdCard.blocked.test.tsx` | 12 | o que o dono lê e o que ele não pode fazer |
| `frontend/components/account/AdsPremiumList.blocked.test.tsx` | 9 | lista do dono sem ações em bloqueado |
| `frontend/e2e/admin-ad-moderation.spec.ts` | 2 | ciclo completo + responsivo 390px |

### Resultado

```
Backend (exceto integração) ....... 217 arquivos, 3545 testes — VERDE
Integração (moderação, DB real) ... 19 testes — VERDE
Frontend .......................... 211 de 213 arquivos, 3332 testes
E2E (moderação) ................... 2 testes — VERDE
```

**As 2 falhas do frontend são preexistentes** e são exatamente as que a
especificação declara fora de escopo: `/seguranca` copy (2 testes) e SEO regional
config (3 testes). Medidas antes e depois — números idênticos. Nenhum arquivo que
alterei é importado por essas suítes.

### Provas de baseline

- **Migrations:** rodei `migrations-compat.integration.test.js` com a 062
  removida e restaurada — **3 falhas idênticas** nos dois casos. A falha é de
  fixture legado (`users.plan` NOT NULL), não da migration nova.
- **Pipeline de anúncios:** rodei `ads-pipeline.integration.test.js` com
  `account.service.js` na versão da main e na minha — **6 falhas idênticas**.

---

## 17. Screenshots

`reports/screenshots/fase-4-10a/` — as 10 exigidas, capturadas no fluxo E2E real
(backend + frontend + Postgres):

`01-admin-anuncio-ativo` · `02-admin-modal-bloquear` · `03-admin-anuncio-bloqueado`
· `04-admin-historico-moderacao` · `05-anunciante-anuncio-bloqueado`
· `06-publico-anuncio-ausente-catalogo` · `07-admin-modal-reativar`
· `08-admin-anuncio-reativado` · `09-publico-anuncio-reativado`
· `10-mobile-admin-bloqueio-390`

**Responsivo:** o E2E verifica em 390px que o modal não gera scroll horizontal
(`scrollWidth - clientWidth <= 1`). Inspeção visual em 390 / 1440 sem overflow.

---

## 18. Dívidas e achados

### Dívidas desta fase

1. **Cache ISR do Next não é invalidado no bloqueio** (janela de ~60s no
   catálogo de cidade). O cache do backend já é. Ligar os dois exige um webhook
   de `revalidateTag` (rota de revalidação no frontend + segredo compartilhado +
   chamada do backend) — decisão estrutural que **não** foi improvisada aqui.
   *Recomendação:* implementar como fase própria, reaproveitando para todas as
   mutações (bloqueio, arquivamento, soft-delete), não só para esta.
   *Impacto atual:* baixo — o detalhe indexável cai na hora; a janela é curta e
   se limpa sozinha; o E2E alarma se alguém aumentá-la.

2. **`ads_blocked_requires_reason_code` está `NOT VALID`.** Promover a `VALID`
   depois de confirmar zero violações em produção.

### Achados preexistentes (NÃO corrigidos, fora de escopo)

3. **`getAnunciosNaRegiao` está quebrada e é código morto.**
   `regions.service.js:497` chama `commercialLayerExpr("sp", "u", "plans")`, mas
   `commercialLayerExpr` é uma **const string** (`ads-ranking.sql.js:78`), não
   uma função — lança `TypeError` ao ser alcançada. A função não tem **nenhum**
   caller em `src/`. Encontrada ao tentar cobri-la no teste de vazamento; a
   superfície regional viva (`regional-radius.repository.js`) foi testada em
   lugar dela. *Recomendação:* remover a função ou corrigir a chamada, em tarefa
   separada.

4. **Falhas preexistentes confirmadas:** `/seguranca` copy e SEO regional config
   (frontend); fixtures legadas de `users.plan` (integração).

---

## 19. Gate final

| Item | Status |
| --- | --- |
| main correta | OK |
| lifecycle auditado | OK |
| modelagem não perde estado anterior | OK — `blocked_previous_status` |
| admin pode bloquear | OK |
| somente admin pode bloquear | OK — 401/403/403/200 testados |
| motivo obrigatório | OK — backend, não só UI |
| bloqueio não exclui anúncio | OK — provado em banco real |
| fotos preservadas | OK |
| relação anunciante preservada | OK |
| audit trail append-only | OK — 2 eventos, bloqueio intocado |
| admin pode reativar | OK |
| reativação não ignora outros gates | OK — restaura, não força `active` |
| usuário comum não remove bloqueio | OK |
| editar não remove bloqueio | OK — 409 / 400 |
| publicar/renovar não remove bloqueio | OK — 410 |
| home / comprar / cidade / região / loja não vazam | OK |
| detalhe não vaza | OK — 404 imediato |
| busca / autocomplete / facetas não vazam | OK |
| sitemap não vaza | OK |
| structured data não vaza | OK — detalhe 404 antes de renderizar |
| cache não mantém público indevidamente | **Parcial** — backend imediato; ISR ~60s (dívida 1) |
| anunciante vê status de bloqueio | OK |
| público não vê motivo nem histórico | OK |
| identidade do admin não vaza | OK |
| idempotência correta | OK |
| concorrência correta | OK — `FOR UPDATE`, testado em DB real |
| testes backend verdes | OK — 3545 |
| testes frontend afetados verdes | OK |
| E2E verde | OK |
| responsive verde | OK |
| zero regressão nova | OK — baseline idêntico |
| nenhuma denúncia implementada | OK — 4.10B |
| nenhuma monetização implementada | OK |

**Veredito: GO.** O único item parcial é a janela de ~60s do cache ISR, que é
menor que o TTL normal do produto, se resolve sozinha, não afeta a URL indexável
e tem um teste que alarma se piorar.

---

## 20. Não implementado (fora de escopo, por design)

- Denúncia de lojista (botão, tabela, fila, notificações, score, bloqueio
  automático) — **Fase 4.10B**
- Qualquer monetização (Mercado Pago, planos, boost, comissão)
- Notificação ao anunciante por e-mail/WhatsApp — exigiria subsistema novo;
  o dono é informado **no painel**
- Alterações em Compradores Ativos, Venda para lojas, agendamento, WhatsApp,
  rounds, offers ou `sale_requests`
