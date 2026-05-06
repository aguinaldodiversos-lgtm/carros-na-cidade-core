# Runbook — Destaque 7 dias via Mercado Pago (Fase 3B)

> **Status:** infraestrutura backend pronta + endpoint dedicado +
> botão frontend + testes. Aguarda configuração de envs em sandbox e
> staging para validação ponta a ponta antes de liberar em produção.

## Visão geral

| Item | Valor |
|---|---|
| Produto | Destaque 7 dias em um anúncio existente |
| Preço fixo | R$ 39,90 (definido no backend, anti-spoof) |
| Disponibilidade | CPF e CNPJ (ambos com anúncio próprio) |
| Duração | 7 dias |
| Compras duplicadas | Estendem o prazo (`highlight_until + 7 dias`), não trocam |
| Não libera | vídeo 360, novos slots de fotos, novos slots de anúncios |
| Endpoint dedicado | `POST /api/payments/boost-7d/checkout` |
| Endpoint legacy aceito | `POST /api/payments/create` com `{ ad_id, boost_option_id }` |
| Webhook | `POST /api/payments/webhook` (compartilhado com planos) |

## Variáveis de ambiente

| Var | Sandbox | Produção | Descrição |
|---|---|---|---|
| `MP_ACCESS_TOKEN` | TEST-... | APP_USR-... | Bearer token API MP. Ausente → modo MOCK (init_point falso) |
| `MP_WEBHOOK_SECRET` | qualquer | obrigatório | HMAC-SHA256 do webhook. Em `NODE_ENV=production` o boot **falha** se ausente (defesa anti-spoof) |
| `MP_PUBLIC_KEY` | TEST-pk-... | APP_USR-pk-... | Public key (usada no front; opcional aqui) |
| `APP_BASE_URL` / `API_URL` / `NEXT_PUBLIC_API_URL` | obrigatório | obrigatório | URL pública do backend para callback do webhook |

Sem `MP_ACCESS_TOKEN`, `createBoostCheckout` ainda registra `payment_intents` com `checkout_resource_id = mock-preference-...` e devolve um `init_point` mock (`successUrl?mock=1`). Útil em dev local.

## Contrato do endpoint

```http
POST /api/payments/boost-7d/checkout
Authorization: Bearer <jwt do user>
Content-Type: application/json

{ "ad_id": "<id do anuncio>" }
```

Resposta 200:

```json
{
  "context": "ad_boost",
  "ad_id": "<id>",
  "boost_option_id": "boost-7d",
  "init_point": "https://mercadopago.com/...",
  "mercado_pago_id": "<preference id>",
  "public_key": "..."
}
```

Erros:
- `400 ad_id e obrigatorio` — body sem `ad_id`
- `404 Anuncio nao encontrado.` — anúncio não existe ou não pertence ao user
- `401` — sem JWT ou expirado (frontend redireciona para `/login?next=`)
- `502 Mercado Pago error (...)` — falha no API do MP (não toca banco)

## Defesas implementadas

| Risco | Defesa |
|---|---|
| Cliente alterar preço (pagar R$ 0,01) | `createBoostCheckout` lê `price` do `BOOST_OPTIONS` no servidor. Não há param `amount`/`price`/`unit_price` na assinatura. Teste de regressão em [tests/payments/boost-7d-flow.test.js](../../tests/payments/boost-7d-flow.test.js) |
| Cliente boostar anúncio de terceiro | `getOwnedAd(userId, adId)` joga 404 se `advertisers.user_id != userId` |
| Cliente comprar boost de plano que não existe | Rota dedicada FIXA `boost_option_id="boost-7d"` no servidor — cliente não consegue trocar para `boost-fake` |
| Webhook falsificado | `MP_WEBHOOK_SECRET` HMAC-SHA256 + `verifyWebhookSignature`. Em prod, boot falha sem o secret |
| Webhook duplicado processando 2x | `payment_intents.payment_resource_id UNIQUE` + `FOR UPDATE` lock + check `intent.status === 'approved'` antes de chamar `applyBoostApproval` |
| Race condition em compras simultâneas | `withTransaction` envolve todo o handler do webhook; lock `FOR UPDATE` em `payment_intents` |
| Boost em anúncio soft-deleted | SQL de `applyBoostApproval` tem `WHERE status != 'deleted'` |
| Compras duplicadas trocarem o prazo em vez de estender | SQL `CASE WHEN highlight_until > NOW() THEN highlight_until + Ndays ELSE NOW() + Ndays END` — alinhado à oferta oficial |

## Sandbox — primeiro teste ponta a ponta

```bash
# 1. Variáveis (use credenciais TEST do MP)
export MP_ACCESS_TOKEN=TEST-...
export MP_WEBHOOK_SECRET=$(openssl rand -hex 32)
export APP_BASE_URL=https://staging.carrosnacidade.com

# 2. Sobe backend em modo dev/stg

# 3. Cria checkout para anúncio existente do user de teste
curl -X POST https://staging.carrosnacidade.com/api/payments/boost-7d/checkout \
  -H "Authorization: Bearer $JWT_USER_TESTE" \
  -H "Content-Type: application/json" \
  -d '{"ad_id":"<ad real do user de teste>"}'

# Resposta esperada: { context: 'ad_boost', init_point: 'https://...mercadopago.com/...', ... }

# 4. Abre init_point no browser, paga com cartão TEST do MP:
#    APRO 5031 4332 1540 6351 — Visa Aprovado
#    OTHE 5031 4332 1540 6351 — Visa Pendente

# 5. Confere webhook chega
psql "$DATABASE_URL" -c "SELECT id, context, status, payment_resource_id, processed_at FROM payment_intents ORDER BY created_at DESC LIMIT 5;"

# 6. Confere highlight_until aplicado
psql "$DATABASE_URL" -c "SELECT id, status, highlight_until, priority FROM ads WHERE id = '<ad>';"

# Esperado: highlight_until ≈ NOW() + 7 dias, priority +8
```

## Idempotência — teste de webhook duplicado

MP às vezes reenviar o mesmo webhook. Para forçar localmente:

```bash
# Capture o payload e signature do webhook real (logs do backend) e replay:
curl -X POST https://staging.carrosnacidade.com/api/payments/webhook \
  -H "x-signature: ts=...,v1=..." \
  -H "x-request-id: ..." \
  -H "Content-Type: application/json" \
  -d '<payload original>'

# Replay 2x — esperado: highlight_until NÃO ganha 7 dias adicionais.
# Por quê: handleWebhookNotification faz FOR UPDATE no intent;
# se intent.status === 'approved' já, applyBoostApproval não é chamado.
```

Validar pós-replay:

```sql
-- Soma de extensões deve bater com Nº de pagamentos APROVADOS distintos
SELECT
  ad_id,
  COUNT(DISTINCT payment_resource_id) AS pagamentos_aprovados,
  COUNT(*) AS intents_total,
  MAX(updated_at) AS ultimo_intent_atualizado
FROM payment_intents
WHERE context = 'boost' AND status = 'approved'
GROUP BY ad_id;
```

## Rollback

A migration 020 não muda — todo schema necessário já existe (`payment_intents`, `ads.highlight_until`). Logo o rollback é apenas:

1. **Rollback de código** (revert do commit Fase 3B): rota `/boost-7d/checkout` deixa de existir, mas `/api/payments/create` com `{ ad_id, boost_option_id: 'boost-7d' }` continua funcionando — qualquer cliente já apontando para o endpoint legacy não quebra.
2. **Pausar pagamentos boost** em prod (sem rollback de código): basta unset `MP_ACCESS_TOKEN`. Backend cai no caminho mock e não cria preferência real. Frontend recebe `init_point` mock e não redireciona para MP real.
3. **Reverter highlights aplicados por engano** (caso muito raro): `UPDATE ads SET highlight_until = NULL, priority = 1 WHERE id = ANY($1::text[])` com lista de IDs do incidente. Documentar antes em `reports/`.

## Smoke pós-deploy em produção

```bash
# 1. Endpoint responde 401 sem JWT (sanity de autenticação)
curl -i -X POST https://carrosnacidade.com/api/payments/boost-7d/checkout \
  -H "Content-Type: application/json" -d '{"ad_id":"x"}'
# Esperado: HTTP/1.1 401

# 2. Endpoint responde 400 com JWT mas sem ad_id
curl -i -X POST https://carrosnacidade.com/api/payments/boost-7d/checkout \
  -H "Authorization: Bearer $JWT_PROD_TESTE" \
  -H "Content-Type: application/json" -d '{}'
# Esperado: HTTP/1.1 400 + body { error: 'ad_id e obrigatorio' }

# 3. Endpoint responde 404 com ad_id inexistente
curl -i -X POST https://carrosnacidade.com/api/payments/boost-7d/checkout \
  -H "Authorization: Bearer $JWT_PROD_TESTE" \
  -H "Content-Type: application/json" -d '{"ad_id":"id-que-nao-existe"}'
# Esperado: HTTP/1.1 404

# 4. Webhook responde 200 ao GET (health)
curl -i https://carrosnacidade.com/api/payments/webhook
# Esperado: HTTP/1.1 200 { ok: true }

# 5. Webhook recusa POST sem signature em produção
curl -i -X POST https://carrosnacidade.com/api/payments/webhook \
  -H "Content-Type: application/json" -d '{}'
# Esperado: HTTP/1.1 401 (invalid signature)
```

## O que NÃO foi feito nesta fase

- Start/Pro continuam usando `POST /api/payments/subscription` legacy. **Não foram tocados.**
- Vídeo 360, créditos mensais, 15 fotos no Pro: continuam fora do escopo.
- Banco de produção mantém preços antigos da migration 020 (Start R$ 299,90 / Pro R$ 599,90). Migration 023 está pronta no repo aguardando execução separada (ver [plans-launch-alignment.md](plans-launch-alignment.md)).
- Página `/planos` continua apontando Destaque 7 dias para `/ajuda?assunto=destaque-7-dias` — só troca para `BoostCheckoutButton` quando o user já tem um anúncio (rota futura `/painel/anuncios/[id]`).

## Critérios de aceite

- ✅ `POST /api/payments/boost-7d/checkout` responde 200 com `init_point` válido para usuário autenticado dono do anúncio
- ✅ Pagamento sandbox aprovado dispara webhook que aplica `highlight_until = NOW() + 7 dias`
- ✅ Replay do mesmo webhook não soma 7 dias novamente
- ✅ Replay com `payment_resource_id` diferente (compra nova) soma +7 dias ao prazo existente
- ✅ Pagamento rejeitado/cancelado deixa `highlight_until` intacto
- ✅ Tentativa de boost em anúncio de outro usuário retorna 404
- ✅ `MP_WEBHOOK_SECRET` ausente em produção falha no boot (proteção)
- ✅ Start/Pro continuam funcionando (regression check via testes existentes)
