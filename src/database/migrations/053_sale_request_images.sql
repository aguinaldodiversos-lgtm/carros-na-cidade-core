-- 053_sale_request_images.sql
-- Fase 4.1 — fotos da solicitação de venda.
--
-- ============================================================================
-- POR QUE UMA TABELA, E NÃO UMA COLUNA JSONB COMO `ads.images`
-- ============================================================================
-- `ads.images` guarda URL ABSOLUTA num JSONB. Esse desenho gerou TRÊS scripts de
-- reparo que existem no repositório hoje:
--
--   scripts/sanitize-ad-images.mjs
--   scripts/migrate-legacy-ad-images-to-r2.mjs
--   scripts/migrate-image-host.mjs
--
-- A causa raiz é sempre a mesma: com a URL gravada, trocar de host ou de
-- endpoint obriga a reescrever o acervo linha a linha.
--
-- O próprio `src/modules/ads/ads.public-images.js` declara o modelo canônico do
-- projeto e coloca `storage_key` em PRIMEIRO lugar, com a URL pública como
-- derivada. Esta tabela nasce já nesse formato: guardamos a chave, e a URL é
-- construída na leitura por `buildCanonicalImageUrlFromStorageKey`. Trocar de
-- host passa a ser mudar uma variável de ambiente.
--
-- Ganho adicional: `storage_key` é o que permite APAGAR o objeto no R2 quando a
-- solicitação some (via `removeVehicleImages`). Com URL absoluta em JSONB isso
-- seria parsing frágil.
--
-- ============================================================================
-- POR QUE NÃO EXISTE `vehicle_images` AQUI
-- ============================================================================
-- `vehicle_images` NÃO é criada por nenhuma migration deste repositório —
-- `ads.public-images.js` consulta `information_schema` em runtime para descobrir
-- se ela existe e quais colunas tem, e devolve Map vazio quando não existe.
-- Generalizar uma tabela cuja existência o próprio código trata como incerta
-- seria construir sobre areia. Reusamos o PIPELINE de upload (r2.service.js),
-- que é agnóstico de entidade, não a tabela.
--
-- ============================================================================
-- O QUE ESTA TABELA NÃO TEM, E POR QUÊ
-- ============================================================================
-- `image_url` — derivada de `storage_key`. Duas colunas para o mesmo fato
--               divergem na primeira troca de host.
--
-- `is_cover`  — a capa é `sort_order = 0`. `vehicle_images` tem `is_cover` E
--               `sort_order` em paralelo, o que permite o estado impossível
--               "duas capas". Um fato, uma coluna (mesma disciplina de
--               `user_notifications.read_at`, que substituiu `is_read` +
--               `read_at`).
--
-- `mime_type` / `size_bytes` — o pipeline normaliza TUDO para WebP antes do
--               PutObject (`normalizeVehicleImage`), então o mime é constante e
--               guardá-lo seria guardar a mesma string N vezes.

CREATE TABLE IF NOT EXISTS sale_request_images (
  id BIGSERIAL PRIMARY KEY,

  -- CASCADE: a foto não descreve nada sem a solicitação. Apagar a linha NÃO
  -- apaga o objeto no R2 — isso é trabalho de script de limpeza, fora da
  -- transação (ver §20 da especificação: objeto órfão no storage nunca é razão
  -- para comprometer a atomicidade do PostgreSQL).
  sale_request_id BIGINT NOT NULL
    REFERENCES sale_requests(id) ON DELETE CASCADE,

  -- FONTE DE VERDADE da imagem. A URL pública é derivada na leitura.
  --
  -- UNIQUE GLOBAL, e não `UNIQUE (sale_request_id, storage_key)`.
  --
  -- A diferença importa: um objeto do R2 pertence a EXATAMENTE UMA solicitação.
  -- Com a chave composta, o mesmo objeto poderia ser reivindicado por duas
  -- solicitações diferentes — inclusive de DONOS diferentes, se um deles
  -- descobrisse a chave do outro. A validação de prefixo
  -- (`sale-requests/{ownerUserId}/`) já barra o caso entre donos distintos, mas
  -- ela é uma regra da APLICAÇÃO; esta constraint é do BANCO, e é ela que
  -- continua valendo para qualquer caminho de escrita futuro (script, SQL
  -- manual, módulo novo).
  --
  -- Efeito colateral desejado: reenviar o mesmo formulário com as mesmas chaves
  -- perde no banco em vez de duplicar a galeria.
  storage_key TEXT NOT NULL,

  -- Ordem de exibição. `0` é a CAPA — não existe coluna booleana concorrente.
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sale_request_images_storage_key_key UNIQUE (storage_key),

  CONSTRAINT sale_request_images_sort_order_check
    CHECK (sort_order >= 0)
);

-- Galeria de UMA solicitação, na ordem de exibição. `id` fecha a ordenação para
-- que duas fotos com o mesmo `sort_order` (possível se um caminho futuro
-- escrever errado) não alternem de posição entre carregamentos.
CREATE INDEX IF NOT EXISTS sale_request_images_request_order_idx
  ON sale_request_images (sale_request_id, sort_order, id);

COMMENT ON TABLE sale_request_images IS
  'Fase 4.1 - fotos da solicitacao de venda. storage_key e a fonte de verdade; a URL publica e derivada na leitura (ads.public-images.js).';

COMMENT ON COLUMN sale_request_images.storage_key IS
  'Chave do objeto no R2 (sale-requests/{ownerUserId}/{uploadSessionUuid}/...). UNIQUE GLOBAL: um objeto pertence a exatamente uma solicitacao.';

COMMENT ON COLUMN sale_request_images.sort_order IS
  'Ordem de exibicao. 0 = capa. Sem coluna is_cover: um fato, uma coluna.';
