-- Migration 019: trigger para manter search_vector atualizado automaticamente
-- Problema: INSERT em ads.repository.js nunca populava search_vector,
-- causando busca textual retornar 0 resultados para anúncios recém-criados.
-- Solução: trigger BEFORE INSERT OR UPDATE que recomputa search_vector
-- a partir de brand + model + title + description.

CREATE OR REPLACE FUNCTION ads_search_vector_refresh()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('portuguese',
    COALESCE(NEW.brand, '') || ' ' ||
    COALESCE(NEW.model, '') || ' ' ||
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.description, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ads_search_vector_trigger ON ads;
CREATE TRIGGER ads_search_vector_trigger
  BEFORE INSERT OR UPDATE OF brand, model, title, description
  ON ads
  FOR EACH ROW
  EXECUTE FUNCTION ads_search_vector_refresh();

-- Retroativo: popula search_vector em anúncios existentes que ainda não têm.
UPDATE ads
SET search_vector = to_tsvector('portuguese',
    COALESCE(brand, '') || ' ' ||
    COALESCE(model, '') || ' ' ||
    COALESCE(title, '') || ' ' ||
    COALESCE(description, '')
)
WHERE search_vector IS NULL
  AND status != 'deleted';
