-- 064_ads_commercial_model.sql
--
-- Search Policy Engine v2.1 — Fase F1 (§3.2).
--
-- `ads.model` guarda a descrição FIPE inteira ("ONIX SEDAN Plus LT 1.0 12V
-- Flex 4p Mec."). A entidade que o comprador procura ("Onix") é DERIVADA por
-- `src/shared/vehicle/commercial-model.js` (deriveCommercialModel). Até aqui
-- essa derivação só acontecia em memória, rota a rota; a faceta "Modelo"
-- agregava a versão crua (auditoria §7.2, H7). Esta migration dá à derivação
-- uma coluna própria, preenchida na escrita do anúncio (ads.repository.js) e
-- pelo backfill idempotente `scripts/backfill-ads-commercial-model.mjs`.
--
-- `ads.model` NÃO é alterado. Coluna nova NULL: quando a derivação não é
-- segura o valor fica NULL e o anúncio simplesmente não entra em buscas por
-- modelo (fail-safe, mesma regra da faceta).

ALTER TABLE ads ADD COLUMN IF NOT EXISTS commercial_model TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_ads_commercial_model_status
  ON ads (commercial_model, status);

COMMENT ON COLUMN ads.commercial_model IS
  'Modelo comercial derivado de ads.model via deriveCommercialModel (rótulo, ex.: "Onix"). NULL = não derivável com segurança. Preenchido na escrita e por scripts/backfill-ads-commercial-model.mjs.';

-- ── search_vector: modelo comercial entra com peso A ─────────────────────────
--
-- Achado da F1 (snapshot de produção, 2026-09-07): `ads` tem TRÊS triggers de
-- search_vector, e só um está versionado:
--
--   ads_search_vector_trigger      → ads_search_vector_refresh()   (migration 019)
--   trg_ads_search_vector_update   → ads_search_vector_update()    (NÃO versionada)
--   trigger_ads_search_vector      → ads_search_vector_update()    (NÃO versionada)
--
-- Postgres dispara triggers do mesmo evento em ordem ALFABÉTICA de nome; o
-- último a rodar vence. Em produção, portanto, quem escreve o vetor é
-- `ads_search_vector_update()` (pesos A=title, B=brand/model, C=city,
-- D=description — é o que a auditoria observou). Num banco só de migrations
-- (CI) existe apenas a função da 019.
--
-- Para que §3.2 valha nos DOIS ambientes, as duas funções recebem o mesmo
-- termo novo, e nada mais muda em nenhuma delas:
--   setweight(to_tsvector('portuguese', coalesce(commercial_model,'')), 'A')
--
-- Substituir função é a única instrução desta fase fora da lista de R3
-- (ADD COLUMN / CREATE INDEX / CREATE TABLE / INSERT) — exigida por §3.2.
-- `CREATE OR REPLACE` da função não versionada no CI apenas a cria sem trigger
-- que a use: inerte.

CREATE OR REPLACE FUNCTION ads_search_vector_refresh()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('portuguese', COALESCE(NEW.commercial_model, '')), 'A')
    || to_tsvector('portuguese',
      COALESCE(NEW.brand, '') || ' ' ||
      COALESCE(NEW.model, '') || ' ' ||
      COALESCE(NEW.title, '') || ' ' ||
      COALESCE(NEW.description, '')
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ads_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('portuguese', COALESCE(NEW.commercial_model, '')), 'A') ||
    setweight(to_tsvector('portuguese', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('portuguese', COALESCE(NEW.brand, '')), 'B') ||
    setweight(to_tsvector('portuguese', COALESCE(NEW.model, '')), 'B') ||
    setweight(to_tsvector('portuguese', COALESCE(NEW.city, '')), 'C') ||
    setweight(to_tsvector('portuguese', COALESCE(NEW.description, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- O trigger da 019 só dispara em UPDATE OF brand/model/title/description; o
-- backfill faz `UPDATE ads SET commercial_model = ...` e precisa recalcular o
-- vetor. Recriado com a coluna nova na lista OF; mesmo nome, mesma função. Os
-- dois triggers não versionados são `BEFORE INSERT OR UPDATE` sem lista OF e
-- já cobrem a coluna nova — não são tocados.
DROP TRIGGER IF EXISTS ads_search_vector_trigger ON ads;
CREATE TRIGGER ads_search_vector_trigger
  BEFORE INSERT OR UPDATE OF brand, model, title, description, commercial_model
  ON ads
  FOR EACH ROW
  EXECUTE FUNCTION ads_search_vector_refresh();
