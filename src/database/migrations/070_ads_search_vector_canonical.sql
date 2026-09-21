-- 070_ads_search_vector_canonical.sql
--
-- Search Policy Engine — Fase F2.2-C1. Fecha D1, D2, D5 e neutraliza D3 da
-- auditoria F2.2-C0 (relatório F2.2-C0_SCHEMA_FTS_DRIFT_RELATORIO.md).
--
-- ── O problema ───────────────────────────────────────────────────────────────
--
-- A auditoria C0 provou que fresh DB e produção escrevem `ads.search_vector`
-- com funções diferentes:
--
--   banco novo (só migrations)  → ads_search_vector_refresh()
--                                 A = commercial_model; brand/model/title/
--                                 description caem todos em D; `city` NÃO entra.
--
--   produção                    → ads_search_vector_update()
--                                 A = commercial_model + title
--                                 B = brand + model
--                                 C = city
--                                 D = description
--
-- Em produção `ads` tem TRÊS triggers do mesmo evento; Postgres os dispara em
-- ordem alfabética e o último sobrescreve NEW.search_vector por inteiro:
--
--   ads_search_vector_trigger  <  trg_ads_search_vector_update  <  trigger_ads_search_vector
--
-- Quem vence é `trigger_ads_search_vector` → `ads_search_vector_update()`.
-- Os dois últimos NÃO são criados por migration nenhuma (os nomes aparecem só
-- num comentário da 064). Logo, o comportamento real de produção não é
-- reproduzível num banco novo, e nenhum teste de CI podia prová-lo.
--
-- Consequência medida na C0, com anúncio sintético:
--   • fresh: q = <cidade do anúncio> devolve ZERO resultados (`city` está fora
--     do vetor) — é diferença de PERTINÊNCIA (`@@`), não só de ordenação;
--   • fresh: `title` e `description` empatam em ts_rank (ambos D), enquanto em
--     produção diferem por uma ordem de grandeza (A vs D). O motor usa os dois:
--     candidate-scope.js aplica `@@` e engine.js usa ts_rank como `text_rank`
--     dentro do ORDER BY.
--
-- ── A correção (estratégia C1 aprovada) ──────────────────────────────────────
--
-- `ads_search_vector_update()` JÁ É VERSIONADA pela 064 e já existe nos dois
-- ambientes com corpo idêntico byte a byte (md5 b6e2e29633e6e31f373ec444d7a1603c
-- em ambos, medido na C0). Ela é a semântica efetiva de produção. Portanto não
-- se escreve função nova aqui, nem se duplica a expressão A/B/C/D: basta
-- repontar o trigger VERSIONADO para ela.
--
-- A lista `OF brand, model, title, description, commercial_model` também sai.
-- Ela existia porque a função antiga não lia mais nada; a de produção lê `city`,
-- e os dois triggers de produção são `BEFORE INSERT OR UPDATE` sem lista `OF`.
-- Sem a lista, um `UPDATE ads SET city = ...` volta a recalcular o vetor — como
-- já acontece em produção hoje.
--
-- ── Neutralidade em produção ─────────────────────────────────────────────────
--
-- Esta migration NÃO muda o valor final do vetor em produção. Hoje
-- `ads_search_vector_trigger` é o PRIMEIRO da fila e seu resultado já é
-- descartado por `trigger_ads_search_vector`, que chama exatamente a mesma
-- função que passamos a usar. Depois desta migration os três triggers escrevem
-- o MESMO vetor: a ordem alfabética deixa de importar e a remoção futura dos
-- redundantes (F2.2-C2) passa a ser provadamente inócua.
--
-- Os dois triggers não versionados de produção NÃO são removidos aqui, e a
-- função órfã `ads_set_search_vector()` também não — item 21 do escopo desta
-- fase. `ads_search_vector_refresh()` é mantida intacta, como caminho de
-- rollback estrutural (reaplicar o bloco de trigger da 064 restaura o estado
-- anterior).
--
-- Nada de `cities`, `unaccent`, `pg_trgm` ou índices trgm nesta migration.

-- ── 1. Trigger canônico ──────────────────────────────────────────────────────
--
-- Idempotente: DROP IF EXISTS + CREATE. O runner (src/database/migrate.js)
-- envolve cada arquivo em BEGIN/COMMIT, então não existe janela em que a
-- tabela fique sem trigger de search_vector — e em produção os outros dois
-- continuam ativos durante toda a operação.

DROP TRIGGER IF EXISTS ads_search_vector_trigger ON ads;
CREATE TRIGGER ads_search_vector_trigger
  BEFORE INSERT OR UPDATE
  ON ads
  FOR EACH ROW
  EXECUTE FUNCTION ads_search_vector_update();

COMMENT ON COLUMN ads.search_vector IS
  'tsvector mantido por ads_search_vector_trigger -> ads_search_vector_update(). Pesos: A = commercial_model + title, B = brand + model, C = city, D = description. Nunca escrever esta coluna manualmente: o trigger BEFORE sobrescreve o valor.';

-- ── 2. Backfill das linhas já existentes ─────────────────────────────────────
--
-- O trigger novo só age em escritas futuras; linhas gravadas pela função antiga
-- continuariam sem `city` e sem os pesos. Como o trigger é BEFORE e recalcula
-- NEW.search_vector inteiro a partir das colunas da própria linha, um UPDATE
-- que não muda nada já basta para reprocessar — e evita repetir a expressão
-- A/B/C/D aqui (a 064 já paga o preço de manter duas cópias; não criamos uma
-- terceira).
--
-- Efeito colateral: nenhum. Verificado na C0 e reconfirmado nesta fase —
-- `ads` não tem trigger que altere coluna de negócio. Os três triggers da
-- tabela são de search_vector; o único que mexeria em `updated_at`
-- (`ads_set_search_vector()`) é órfão, nenhum trigger o chama. `updated_at` é
-- escrito explicitamente pelo repositório, não por trigger — portanto este
-- UPDATE não altera metadado de negócio algum.
--
-- RLS: a política `ads_write_owner` (017) é permissiva quando
-- `app.current_user_id` não está definido, e é o caso aqui (o runner não chama
-- set_config). Além disso o papel da migration é o OWNER da tabela em produção
-- e `relforcerowsecurity = false` — nenhuma linha é filtrada em silêncio.
--
-- Idempotência: a reexecução regrava as linhas, mas o vetor resultante é
-- idêntico (a função é determinística sobre as colunas da linha). Optou-se por
-- não condicionar o UPDATE porque a única condição EXATA exigiria repetir a
-- expressão A/B/C/D — o acoplamento que esta fase existe para não criar.

UPDATE ads SET search_vector = search_vector;

-- ── 3. Índice GIN ────────────────────────────────────────────────────────────
--
-- `idx_ads_search_vector` existe em produção com este nome exato e é usado
-- (idx_scan = 53 na leitura da C0), mas nenhuma migration o criava: um ambiente
-- novo ou um restore servia busca textual sem índice. IF NOT EXISTS torna a
-- instrução no-op em produção e efetiva no banco novo.
--
-- Criado DEPOIS do backfill: um único build sobre o estado final, em vez de
-- índice mantido linha a linha durante o UPDATE.

CREATE INDEX IF NOT EXISTS idx_ads_search_vector
  ON ads USING gin (search_vector);
