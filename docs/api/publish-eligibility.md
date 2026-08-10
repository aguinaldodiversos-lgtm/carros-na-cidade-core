# Elegibilidade unificada (publicação PF / PJ)

## Função oficial

`resolvePublishEligibility(userId, preloadedUser?)` em `src/modules/account/account.service.js` — **apenas regras** de documento, plano e limites (não cria linha em `advertisers`).

Mesma lógica para:

- `POST /account/plans/eligibility` (consulta **pura**, sem efeito colateral)
- `ensurePublishEligibility` → criação de anúncio (`ads.publish.eligibility.service.js`)
- Campo `publish_eligibility` no payload de `GET /account/dashboard`

`validatePlanEligibility` permanece como alias (deprecated) da mesma implementação.

## Garantir anunciante (`ensureAdvertiserForUser`)

Existe **um único** ponto que cria linha em `advertisers`:

| Momento          | Onde                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Publicar anúncio | `ensureAdvertiserForPublishing` com `city_id` do anúncio (após `resolvePublishEligibility` aprovar) |

Leitura de conta sem dependência circular: `getAccountUser` em `account.user.read.js`.

### Por que só um ponto (Fase 0.1, 2026-08-10)

Esta tabela já teve quatro linhas. As de “Registro” (`auth.service.js`) e “Painel”
(`getDashboardPayload`) foram removidas em refactors anteriores sem qualquer
quebra — a documentação é que ficou para trás.

A quarta, “Elegibilidade de plano”, saiu na Fase 0.1. Ela chamava
`ensureAdvertiserForUser` **sem `city_id`**, e era o único caminho de produção que
alcançava o fallback territorial do resolver: perguntar “posso publicar?” criava
um anunciante numa cidade adivinhada a partir de `users.city` (busca parcial, sem
UF) ou, na falta disso, na primeira cidade da tabela.

A criação nunca foi necessária para a resposta — como esta própria página já
dizia na seção “Advertiser”, o anunciante não faz parte da regra de
documento/plano. Sem linha em `advertisers`, os `COUNT` por `adv.user_id`
devolvem 0, que é a resposta correta para quem ainda não publicou.

Efeito prático em quem só consulta elegibilidade: nada muda na resposta. O
cadastro da loja passa a nascer somente na publicação — que é o que a tela
“Dados da loja” já dizia ao usuário (“Publique um anúncio para criar o cadastro
da loja”).

Testes: `tests/account/plans-eligibility-no-side-effect.test.js` e
`tests/ads/publish-supplies-explicit-city.test.js`.

### Cidade é obrigatória e explícita

`resolveCityIdForNewAdvertiser(userId, cityId)` é **fail closed**: aceita apenas
um `cityId` inteiro positivo que exista em `cities`. Sem isso, lança
`400 ADVERTISER_CITY_REQUIRED` e registra WARN — não há mais busca aproximada por
texto nem “primeira cidade cadastrada”.

A exigência vale só no caminho de **criação**: `ensureAdvertiserForUser` continua
idempotente e devolve o anunciante já existente sem pedir cidade de novo.

## Regras (ordem)

1. **CNPJ:** `document_verified` obrigatório para publicar.
2. **CPF:** se não existe nenhum anúncio com `status != 'deleted'`, o CPF deve estar verificado.
3. **Limite de plano:** `countActiveAdsByUser < planLimit` (anúncios **ativos** vs teto do plano / limite gratuito).

Métricas:

- Documento / “primeiro anúncio”: `countNonDeletedAdsForUser`
- Vagas: `countActiveAdsByUser` vs `planLimit` (alinhado a `stats.available_limit` no dashboard)

## Advertiser

Não faz parte da elegibilidade de documento/plano. No fluxo de **criar anúncio**, depois de `resolvePublishEligibility` aprovar, `ensureAdvertiserForPublishing` cria ou reutiliza o registro em `advertisers` com a `city_id` do anúncio (idempotente; lock por usuário).

Integridade DB opcional: migration `008_advertisers_user_fk.sql` (FK `advertisers.user_id` → `users.id`, pode ser ignorada em bancos incompatíveis). Auditoria: `node scripts/report-advertiser-integrity.mjs`.
