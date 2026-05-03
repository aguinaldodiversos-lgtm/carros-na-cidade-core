-- 021_cities_geo_and_region_memberships.sql
--
-- Base de "regiao aproximada" para a futura Pagina Regional. Esta migration:
--   1. Adiciona latitude/longitude em cities (NULL ate o seed IBGE rodar
--      separadamente -- fora do escopo desta migration).
--   2. Cria region_memberships(base_city_id, member_city_id, distance_km, layer)
--      com FK para cities + indices para o lookup do endpoint privado
--      /api/internal/regions/:slug.
--   3. Backfill da self-row (base = member, layer 0, distance 0) para todas as
--      cities existentes -- garante que toda cidade ja tem pelo menos uma linha
--      em region_memberships, simplificando queries downstream.
--
-- O conjunto de vizinhas (layer 1 ate 30 km, layer 2 entre 30-60 km) e populado
-- depois, manualmente, via `npm run regions:build` (scripts/build-region-memberships.mjs).
-- O script depende de cities.latitude/longitude estarem populadas, o que ainda
-- nao acontece neste momento -- e seed IBGE.
--
-- ON DELETE CASCADE em ambos os FK: se uma cidade for removida (consolidacao,
-- erro de seed), as memberships dela limpam automaticamente.

ALTER TABLE cities ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS region_memberships (
  base_city_id BIGINT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  member_city_id BIGINT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  distance_km NUMERIC,
  layer SMALLINT NOT NULL DEFAULT 1,
  PRIMARY KEY (base_city_id, member_city_id)
);

CREATE INDEX IF NOT EXISTS region_memberships_base_layer_idx
  ON region_memberships (base_city_id, layer);

CREATE INDEX IF NOT EXISTS region_memberships_member_idx
  ON region_memberships (member_city_id);

COMMENT ON TABLE region_memberships IS
  'Mapa de proximidade (cidade-base + vizinhas) consumido por /api/internal/regions/:slug. Layer 0 = self; layer 1 = ate 30km; layer 2 = 30-60km.';

-- Backfill self-row: cada cidade e membro de si mesma na camada 0.
-- ON CONFLICT DO NOTHING: idempotente; se a migration rodar duas vezes ou se
-- o build worker ja tiver rodado, nada quebra.
INSERT INTO region_memberships (base_city_id, member_city_id, distance_km, layer)
SELECT id, id, 0, 0
FROM cities
ON CONFLICT (base_city_id, member_city_id) DO NOTHING;
