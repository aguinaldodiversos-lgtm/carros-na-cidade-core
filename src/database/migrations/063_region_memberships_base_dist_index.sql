-- 063_region_memberships_base_dist_index.sql
--
-- Search Policy Engine v2.1 — Fase F1 (§3.1).
--
-- O motor de busca elege o território por `distance_km` a partir de uma
-- cidade-base (`WHERE base_city_id = $1 AND distance_km <= $2`, ordenado por
-- distância). Os índices existentes cobrem (base, layer) e (member); nenhum
-- serve a esse padrão. Índice ADITIVO — nada é renomeado ou removido (R3).
CREATE INDEX IF NOT EXISTS idx_region_memberships_base_dist
  ON region_memberships (base_city_id, distance_km);
