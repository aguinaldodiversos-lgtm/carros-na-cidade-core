# Elegibilidade unificada (publicação PF / PJ)

## Função oficial

`resolvePublishEligibility(userId, preloadedUser?)` em `src/modules/account/account.service.js` — **apenas regras** de documento, plano e limites (não cria linha em `advertisers`).

Mesma lógica para:

- `POST /account/plans/eligibility` (com `ensureAdvertiserForUser` antes da resposta)
- `ensurePublishEligibility` → criação de anúncio (`ads.publish.eligibility.service.js`)
- Campo `publish_eligibility` no payload de `GET /account/dashboard`

`validatePlanEligibility` permanece como alias (deprecated) da mesma implementação.

## Garantir anunciante (`ensureAdvertiserForUser`)

Para evitar “anunciante não encontrado”, o backend garante uma linha em `advertisers` nestes pontos:

| Momento                | Onde                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Registro               | `auth.service.js` após criar `users`                                                                |
| Painel                 | início de `getDashboardPayload`                                                                     |
| Elegibilidade de plano | `POST /account/plans/eligibility` (rota)                                                            |
| Publicar anúncio       | `ensureAdvertiserForPublishing` com `city_id` do anúncio (após `resolvePublishEligibility` aprovar) |

Leitura de conta sem dependência circular: `getAccountUser` em `account.user.read.js`.

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
