-- 056_sale_request_minimum_accepted_price.sql
-- Fase 4.3.3 — o PISO declarado pelo proprietário.
--
-- Uma linha com valor aqui significa exatamente uma frase:
--
--     "eu não vendo este carro por menos do que R$ X".
--
-- É o primeiro número que a pessoa física põe no produto, e ele muda a
-- mecânica da disputa: até a 4.3 a primeira proposta só precisava ser positiva,
-- e um lojista podia abrir com qualquer valor. A partir daqui a primeira
-- proposta precisa alcançar o piso; as seguintes continuam precisando superar a
-- maior atual.
--
-- ============================================================================
-- POR QUE NULLABLE, MESMO SENDO OBRIGATÓRIO NA PUBLICAÇÃO
-- ============================================================================
-- O campo é OBRIGATÓRIO no código de criação e OPCIONAL no schema. A divergência
-- é deliberada e tem uma única causa: as solicitações que já existem.
--
-- Elas foram publicadas quando a pergunta não era feita. Não sabemos, e não
-- temos como descobrir, qual era o mínimo que aquelas pessoas aceitariam. Um
-- `NOT NULL` obrigaria a inventar um DEFAULT para elas, e todo candidato é uma
-- afirmação falsa sobre a intenção de alguém:
--
--   85% da FIPE      — atribui ao proprietário uma recomendação COMERCIAL que
--                      ele nunca leu, e que passaria a recusar propostas em
--                      nome dele;
--   a maior proposta — inverte a causalidade: o piso passaria a ser consequência
--                      do que as lojas ofereceram, e subiria sozinho;
--   a própria FIPE   — um piso que praticamente nenhuma loja alcança, o que
--                      equivale a encerrar a solicitação sem avisar ninguém;
--   zero             — um piso que não recusa nada, escrito como se fosse
--                      declaração; o `CHECK > 0` existe justamente para que
--                      "sem piso" nunca seja confundido com "piso zero".
--
-- Com NULL, a distinção fica escrita no dado: NULL = a regra não existia quando
-- esta linha nasceu; valor = o proprietário declarou este piso. O código de
-- ofertas lê os dois casos e trata cada um pelo que ele é (ver
-- `sale-requests.offers.service.js`).
--
-- Quando não houver mais linha anterior à 4.3.3 em produção, um `SET NOT NULL`
-- pode ser feito em migration própria — e será uma decisão sobre DADOS
-- existentes, não uma suposição sobre intenções perdidas.
--
-- ============================================================================
-- TIPO
-- ============================================================================
-- `NUMERIC(14,2)`, a convenção monetária do projeto — a mesma de `ads.price`,
-- `sale_requests.fipe_reference_value`, `sale_request_offers.amount` e dos
-- valores da ficha da 054. NUNCA float: este número é comparado com o valor de
-- cada proposta dentro de uma transação, e um erro de arredondamento binário
-- aqui recusaria (ou aceitaria) um lance por um centavo fantasma.
--
-- ============================================================================
-- SEM ÍNDICE
-- ============================================================================
-- Nenhuma query filtra ou ordena por este campo. Ele é lido junto da linha que
-- já foi encontrada por `id` (na validação da proposta, dentro do lock) ou
-- devolvido na projeção do feed, que já varre por cidade+status. Um índice aqui
-- seria custo de escrita sem leitura correspondente.

ALTER TABLE sale_requests
  ADD COLUMN IF NOT EXISTS minimum_accepted_price NUMERIC(14, 2);

-- ---------------------------------------------------------------------------
-- O CHECK
-- ---------------------------------------------------------------------------
-- `IS NULL OR > 0`, e as duas metades importam:
--
--   `IS NULL`  mantém válida toda linha anterior a esta migration — sem ela a
--              migration falharia no primeiro banco com dados, que é o de
--              produção;
--   `> 0`      impede que "sem piso" seja escrito como zero. Zero passaria pela
--              validação de dinheiro (é um número), seria exibido como
--              "R$ 0,00" e aceitaria qualquer proposta como se o proprietário
--              tivesse concordado.
--
-- Sem teto: `NUMERIC(14,2)` já limita a grandeza, e o limite fino de sanidade
-- (`MONEY_MAX`) vive na aplicação, onde consegue devolver mensagem de campo em
-- vez de erro de banco.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_minimum_accepted_price_check'
  ) THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_minimum_accepted_price_check
      CHECK (minimum_accepted_price IS NULL OR minimum_accepted_price > 0);
  END IF;
END $$;

COMMENT ON COLUMN sale_requests.minimum_accepted_price IS
  'Piso declarado pelo proprietario (Fase 4.3.3). NULL = solicitacao anterior a regra, jamais "sem piso" nem zero. Obrigatorio no codigo de criacao; nullable no schema so por causa do legado. A primeira proposta precisa alcanca-lo; as seguintes precisam superar a maior atual.';
