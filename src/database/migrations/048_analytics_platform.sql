-- =============================================================================
-- 048 — analytics_events.platform: iOS vs Android vs outros
-- =============================================================================
--
-- MOTIVO: `device_type` só distingue mobile/tablet/desktop, então iPhone e
-- Android caem no mesmo balde. Ao decidir se vale implementar decodificação de
-- HEIC no servidor (dependência WASM, ~1-3s e centenas de MB por foto de
-- 12MP), a pergunta "quanto do público é Android?" não teve resposta: o dado
-- não existia. O `accept` explícito do seletor já faz o iOS converter
-- HEIC→JPEG sozinho; se o parque for majoritariamente iOS, a conversão no
-- servidor não se paga.
--
-- PRIVACIDADE: mantém o mesmo compromisso da migration 036 — a tabela NÃO
-- guarda User-Agent bruto (só `user_agent_hash`, irreversível). `platform` é
-- um balde GROSSO, com a mesma granularidade de `device_type`: não identifica
-- pessoa, aparelho nem versão. Deliberadamente sem `os_version` nem modelo.
--
-- Nullable e sem backfill: eventos antigos ficam NULL (o dado não existe
-- retroativamente — o UA que os gerou nunca foi armazenado). Consultas devem
-- filtrar `platform IS NOT NULL` para não contar histórico como "outros".
-- =============================================================================

ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS platform TEXT;

COMMENT ON COLUMN analytics_events.platform IS
  'Plataforma derivada do User-Agent no servidor: ios | android | other. Balde grosso, sem versão nem modelo — mesma granularidade de device_type. NULL para eventos anteriores à migration 048.';

-- Índice parcial: só linhas com o dado novo. As consultas desta coluna são
-- sempre segmentação (GROUP BY platform) sobre janela recente, e o parcial
-- evita indexar o histórico NULL, que é a maior parte da tabela hoje.
CREATE INDEX IF NOT EXISTS analytics_events_platform_idx
  ON analytics_events (platform, occurred_at DESC)
  WHERE platform IS NOT NULL;
