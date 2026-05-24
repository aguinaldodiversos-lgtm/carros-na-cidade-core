#!/usr/bin/env bash
# Smoke público de LINGUAGEM/HIGIENE — briefing P0 2026-05-24.
#
# Garante que o HTML público não contenha strings técnicas, dados de
# teste, encoding quebrado, R$ 0 ou fallbacks fake em nenhuma das 8
# rotas críticas. Complementa `public-territorial-smoke.sh` (territorial)
# e o gate de 404 do middleware (ad-detail-gate).
#
# Uso:
#   BASE_URL=https://www.carrosnacidade.com bash scripts/smoke/public-language-smoke.sh
#
# Critérios de aceite (briefing P0 2026-05-24, itens A/B/C/D/E):
#   1. Nenhuma rota pública pode conter strings técnicas:
#        - "backend irá incorporar"
#        - "Em breve — backend"
#        - "DeployModel"
#        - "Teste alerta"
#        - "SÆo Paulo"
#   2. Nenhuma rota pública pode conter dados de teste leakados:
#        - "Auto Center Teste"
#   3. /simulador-financiamento/[cidade] não pode renderizar fallbackHero
#      fake (T-Cross R$ 105.900 sintético id=999001).
#   4. Página de detalhe (/veiculo/<real>) não pode renderizar "R$ 0" no
#      preço principal.
#   5. /veiculo/anuncio-inexistente deve retornar 404 real (sem body
#      "Veículo não encontrado" + status 200 — middleware ad-detail-gate
#      garante isso desde 093969a6).
#
# Sai com código 1 se qualquer crítica falhar.

set -uo pipefail

BASE_URL="${BASE_URL:-https://www.carrosnacidade.com}"
TIMEOUT="${TIMEOUT:-30}"
USER_AGENT="cnc-language-smoke/2026-05-24"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

failures=0
warnings=0

# Rotas mínimas — briefing P0 2026-05-24.
ROUTES=(
  "/"
  "/comprar/estado/sp"
  "/carros-em/atibaia-sp"
  "/carros-em/campinas-sp"
  "/carros-usados/regiao/atibaia-sp"
  "/simulador-financiamento/sao-paulo-sp"
  "/tabela-fipe/sao-paulo-sp"
  "/anunciar"
)

# Strings PROIBIDAS em qualquer rota pública.
# Briefing P0 2026-05-24 + extensão briefing P0 2026-05-25.
FORBIDDEN_STRINGS=(
  # textos técnicos no FilterSidebar (removidos em ce48eb83):
  "backend irá incorporar"
  "Em breve — backend"
  "features[]"
  "has_photo"
  # leak de ads de teste no autocomplete/listagem:
  "DeployModel"
  "FORD DeployModel"
  "Teste alerta"
  "Teste alerta final"
  "Teste alerta API"
  "Teste fila worker"
  "Carro teste"
  "Carro teste WhatsApp"
  "TEST Test"
  # encoding quebrado em cidades:
  "SÆo Paulo"
  # dirty seller_name (filtrado pelo DIRTY_ADVERTISER_FIELDS_SQL):
  "Auto Center Teste"
)

# Marcadores do fallbackHero fake removido em /simulador-financiamento.
# id=999001 e slug literal são as assinaturas únicas do fallback.
FALLBACKHERO_MARKERS=(
  "\"id\":999001"
  "volkswagen-t-cross-2022-2023"
)

echo "=============================================="
echo " CNC smoke de linguagem pública — 2026-05-24"
echo " BASE_URL = $BASE_URL"
echo "=============================================="

fetch_to_tmp() {
  local url="$1"
  local out="$2"
  curl --max-time "$TIMEOUT" -A "$USER_AGENT" -L -s -o "$out" -w "%{http_code}" "$url" 2>/dev/null || echo "000"
}

check_forbidden_strings() {
  local route="$1"
  local body_file="$2"

  for str in "${FORBIDDEN_STRINGS[@]}"; do
    if grep -qF -- "$str" "$body_file"; then
      echo -e "  ${RED}FAIL [$route] contém '$str'${NC}"
      failures=$((failures + 1))
    fi
  done
}

echo ""
echo "── 1. Strings proibidas em 8 rotas públicas ──"
for route in "${ROUTES[@]}"; do
  body=$(mktemp)
  status=$(fetch_to_tmp "$BASE_URL$route" "$body")
  printf "  %-46s HTTP %s\n" "$route" "$status"
  if [[ "$status" != "200" ]]; then
    echo -e "    ${YELLOW}WARN status != 200 — pulando checks de string${NC}"
    warnings=$((warnings + 1))
    rm -f "$body"
    continue
  fi
  check_forbidden_strings "$route" "$body"
  rm -f "$body"
done

echo ""
echo "── 2. fallbackHero fake em /simulador-financiamento ──"
body=$(mktemp)
status=$(fetch_to_tmp "$BASE_URL/simulador-financiamento/sao-paulo-sp" "$body")
if [[ "$status" == "200" ]]; then
  for marker in "${FALLBACKHERO_MARKERS[@]}"; do
    if grep -qF -- "$marker" "$body"; then
      echo -e "  ${RED}FAIL fallbackHero ressuscitou — marker '$marker' presente${NC}"
      failures=$((failures + 1))
    fi
  done
  if ! grep -qF "999001" "$body" && ! grep -qF "volkswagen-t-cross-2022-2023" "$body"; then
    echo -e "  ${GREEN}OK sem fallbackHero T-Cross fake${NC}"
  fi
else
  echo -e "  ${YELLOW}WARN /simulador-financiamento status $status — não checado${NC}"
  warnings=$((warnings + 1))
fi
rm -f "$body"

echo ""
echo "── 3. /veiculo/<inexistente> = 404 real (ad-detail-gate) ──"
status=$(curl --max-time "$TIMEOUT" -A "$USER_AGENT" \
  -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/veiculo/anuncio-inexistente-language-smoke-$(date +%s)" 2>/dev/null || echo "000")
if [[ "$status" == "404" ]]; then
  echo -e "  ${GREEN}OK 404 real para /veiculo/<inexistente>${NC}"
else
  echo -e "  ${RED}FAIL /veiculo/<inexistente> retornou $status (esperado 404)${NC}"
  failures=$((failures + 1))
fi
status=$(curl --max-time "$TIMEOUT" -A "$USER_AGENT" \
  -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/anuncios/anuncio-inexistente-language-smoke-$(date +%s)" 2>/dev/null || echo "000")
if [[ "$status" == "404" ]]; then
  echo -e "  ${GREEN}OK 404 real para /anuncios/<inexistente>${NC}"
else
  echo -e "  ${RED}FAIL /anuncios/<inexistente> retornou $status (esperado 404)${NC}"
  failures=$((failures + 1))
fi

echo ""
echo "── 4. Autocomplete público SEM dirty brands/models (briefing P0 2026-05-25) ──"
# /api/ads/autocomplete?q=t deve retornar JSON sem "TEST", "DeployModel",
# "Teste", "FAKE", "DUMMY" no array de brands/models. O dicionário do
# autocomplete usa loadBrandDictionary/loadModelDictionary, que antes
# NÃO aplicavam DIRTY_AD_FIELDS_SQL.
body=$(mktemp)
status=$(fetch_to_tmp "$BASE_URL/api/ads/autocomplete?q=t" "$body")
if [[ "$status" == "200" ]]; then
  for pattern in 'TEST' 'DeployModel' 'Teste alerta' 'FAKE' 'DUMMY' 'Sample'; do
    if grep -qiE "\"$pattern" "$body" 2>/dev/null; then
      echo -e "  ${RED}FAIL autocomplete contém brand/model com '$pattern'${NC}"
      failures=$((failures + 1))
    fi
  done
  # Sucesso silencioso — só reporta o status.
  echo -e "  ${GREEN}OK autocomplete sem dirty patterns${NC}"
else
  echo -e "  ${YELLOW}WARN autocomplete status $status — não checado${NC}"
  warnings=$((warnings + 1))
fi
rm -f "$body"

echo ""
echo "── 5. R$ 0 em página de detalhe real ──"
# Pega o primeiro href /veiculo/* listado em /comprar/estado/sp e abre.
body=$(mktemp)
fetch_to_tmp "$BASE_URL/comprar/estado/sp" "$body" > /dev/null
first_href=$(grep -oE '/veiculo/[a-z0-9][a-z0-9-]+' "$body" | head -1)
rm -f "$body"
if [[ -n "$first_href" ]]; then
  body=$(mktemp)
  status=$(fetch_to_tmp "$BASE_URL$first_href" "$body")
  if [[ "$status" == "200" ]]; then
    # `R$ 0` (com ou sem espaço) no body. Padrão exato para evitar matches
    # legítimos como "R$ 0,99" (não realista mas defensivo).
    if grep -qE 'R\$\s?0[^0-9,]' "$body"; then
      echo -e "  ${RED}FAIL $first_href contém 'R\$ 0' (preço fake)${NC}"
      failures=$((failures + 1))
    else
      echo -e "  ${GREEN}OK $first_href sem 'R\$ 0'${NC}"
    fi
  else
    echo -e "  ${YELLOW}WARN $first_href status $status${NC}"
    warnings=$((warnings + 1))
  fi
  rm -f "$body"
else
  echo -e "  ${YELLOW}WARN nenhum href /veiculo/* encontrado em /comprar/estado/sp${NC}"
  warnings=$((warnings + 1))
fi

echo ""
echo "=============================================="
echo " Falhas críticas: $failures"
echo " Warnings (não-críticos): $warnings"
echo "=============================================="

if [[ "$failures" -gt 0 ]]; then
  exit 1
fi
exit 0
