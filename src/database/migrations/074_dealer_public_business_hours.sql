-- Horário de atendimento é opcional e editável; NULL mantém todos os cadastros intactos.
-- Não altera anúncios, contatos nem imagens existentes.
ALTER TABLE advertisers
  ADD COLUMN IF NOT EXISTS public_business_hours TEXT;
