# `modules/integrations` — não montado em `app.js`

**Resumo canônico de anúncios + política de produção:** `src/modules/ads/README.md` (seção “Resumo operacional”).

**Estado:** nenhuma rota abaixo está registrada em `src/app.js`.

---

## Duplicação de lógica?

**Não.** Os dois stubs que criam anúncio convergem no **mesmo pipeline**:

| Caminho | Entrada no pipeline | Função |
|--------|----------------------|--------|
| CommonJS (`createAdFromApi.controller.js`) | Monta o payload a partir de campos reduzidos + `advertiserId` no token | Chama **`createAdNormalized`** diretamente |
| ESM (`integration.controller.js`) | `req.body` já no formato esperado pelo validador | Chama **`ads.service.create`** → **`createAdNormalized`** |

Ou seja, **uma única regra de INSERT/validação** (`createAdNormalized` em `ads.create.pipeline.service.js`). Não há dois caminhos de persistência paralelos.

---

## O que diferia (e foi alinhado)

Antes, só o **envelope HTTP de sucesso** divergia (`{ ad_id }` vs corpo cru do anúncio). Isso gerava risco de cliente/parceiro tratando respostas incompatíveis.

**Correção:** ambos retornam o mesmo contrato que **`POST /api/ads`** em `ads.controller.js`:

- status **201**
- corpo **`{ success: true, data: <anúncio> }`**

---

## O que ainda difere (por desenho)

| Aspeto | Token + `apiTokenAuth` | HMAC + `api_clients` |
|--------|-------------------------|----------------------|
| Autenticação | Middleware legado (`req.advertiserId`) | `verifyHmac` + `req.apiClient` |
| Corpo da requisição | Campos parciais (`brand`, `model`, …); servidor completa cidade/título | Esperado **body JSON compatível** com o validador de criação (como o painel) |
| Arquivos | `src/routes/integrations/index.js` | `integration.routes.js` + `integration.auth.js` |

**Antes de montar** `POST …/ads` para integrações:

1. Escolher **um** mecanismo de autenticação (token ou HMAC) e **um** formato de body documentado.
2. Registrar em `src/app.js` e em `docs/api-routes-inventory.md`.
3. Remover ou arquivar o stub não usado para não manter dois clientes HTTP com semânticas de auth diferentes.
