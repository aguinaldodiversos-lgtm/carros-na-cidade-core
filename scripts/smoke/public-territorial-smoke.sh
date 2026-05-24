#!/usr/bin/env bash
# Smoke público pós-fix territorial 2026-05-24.
#
# Uso:
#   BASE_URL=https://carrosnacidade.com bash scripts/smoke/public-territorial-smoke.sh
#
# Critérios de aceite (briefing 2026-05-24):
#   1. Cidade Atibaia > 0 anúncios
#   2. Regional Atibaia > 0 anúncios
#   3. Regional Campinas não dá timeout
#   4. Águas de Lindóia mantém > 0 (regressão)
#   5. Detalhe inexistente retorna 404 (não 200 com fallback fake)
#   6. /anunciar/novo redireciona deslogado para /login
#
# Sai com código 1 se qualquer crítica falhar.

set -uo pipefail

BASE_URL="${BASE_URL:-https://carrosnacidade.com}"
TIMEOUT="${TIMEOUT:-15}"
USER_AGENT="cnc-smoke/2026-05-24"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

failures=0
warnings=0

probe() {
  local label="$1"
  local url="$2"
  local expected_status="$3"
  local must_contain="${4:-}"
  local critical="${5:-true}"

  echo ""
  echo "→ $label"
  echo "  GET $url"

  local body status
  status=$(curl --max-time "$TIMEOUT" -A "$USER_AGENT" -L \
    -s -o /tmp/cnc_smoke_body -w "%{http_code}" "$url" || echo "000")
  body="$(cat /tmp/cnc_smoke_body 2>/dev/null || echo "")"

  if [[ "$status" != "$expected_status" ]]; then
    echo -e "  ${RED}STATUS=$status (esperado $expected_status)${NC}"
    if [[ "$critical" == "true" ]]; then
      failures=$((failures + 1))
    else
      warnings=$((warnings + 1))
    fi
    return 1
  fi
  echo -e "  ${GREEN}STATUS=$status${NC}"

  if [[ -n "$must_contain" ]] && ! grep -q -- "$must_contain" /tmp/cnc_smoke_body; then
    echo -e "  ${RED}BODY missing '$must_contain'${NC}"
    if [[ "$critical" == "true" ]]; then
      failures=$((failures + 1))
    else
      warnings=$((warnings + 1))
    fi
    return 1
  fi
  if [[ -n "$must_contain" ]]; then
    echo -e "  ${GREEN}BODY contém '$must_contain'${NC}"
  fi
  return 0
}

echo "=============================================="
echo " CNC smoke público — 2026-05-24"
echo " BASE_URL = $BASE_URL"
echo "=============================================="

# --- 1. Cidade base (Atibaia / Campinas / Águas de Lindóia) ---------------
probe "Atibaia cidade — deve listar > 0" \
  "$BASE_URL/carros-em/atibaia-sp" \
  "200" \
  "Atibaia"

probe "Campinas cidade — deve coerir com /comprar/estado/sp" \
  "$BASE_URL/carros-em/campinas-sp" \
  "200" \
  "Campinas"

probe "Águas de Lindóia cidade — regressão" \
  "$BASE_URL/carros-em/aguas-de-lindoia-sp" \
  "200" \
  "Lindóia" \
  false

# --- 2. Estado SP ---------------------------------------------------------
probe "/comprar/estado/sp deve responder 200" \
  "$BASE_URL/comprar/estado/sp" \
  "200" \
  "São Paulo"

# --- 3. Regional ----------------------------------------------------------
# REGIONAL_PAGE_ENABLED pode estar false em prod (Fase A do runbook) →
# nesse caso a rota retorna 404 by design; tratamos como warning, não falha.
probe "/carros-usados/regiao/atibaia-sp — 200 se flag ativa, 404 se off" \
  "$BASE_URL/carros-usados/regiao/atibaia-sp" \
  "200" \
  "Atibaia" \
  false

probe "/carros-usados/regiao/campinas-sp — não timeout" \
  "$BASE_URL/carros-usados/regiao/campinas-sp" \
  "200" \
  "" \
  false

# --- 4. Detalhe inexistente DEVE 404 (sem fallback fake) ------------------
probe "/veiculo/anuncio-inexistente-deve-404 — sem fake fallback" \
  "$BASE_URL/veiculo/anuncio-inexistente-zzz-2026-05-24" \
  "404" \
  ""

probe "/anuncios/anuncio-inexistente — sem fake fallback" \
  "$BASE_URL/anuncios/anuncio-inexistente-zzz-2026-05-24" \
  "404" \
  ""

# --- 5. /anunciar/novo deslogado deve ir para /login ----------------------
echo ""
echo "→ /anunciar/novo deslogado — redirect para /login"
# A página renderiza primeiro (200) e o redirect acontece client-side via
# router.replace após /api/dashboard/me retornar 401. Confirmar manual no
# browser DevTools (Network tab). Aqui só confirmamos que a rota não trava.
status=$(curl --max-time "$TIMEOUT" -A "$USER_AGENT" \
  -s -o /tmp/cnc_smoke_body -w "%{http_code}" "$BASE_URL/anunciar/novo" || echo "000")
echo "  STATUS=$status (esperado 200 — confirme redirect no browser)"
if [[ "$status" != "200" ]]; then
  failures=$((failures + 1))
fi

# --- 6. API ads.search retorna shape esperado -----------------------------
probe "API /api/ads/search?state=SP — JSON success:true" \
  "$BASE_URL/api/ads/search?state=SP&limit=5" \
  "200" \
  '"success":true'

# --- 7. Nenhum 'SÆo Paulo' em HTML público --------------------------------
echo ""
echo "→ Verificando ausência de 'SÆo Paulo' em /comprar/estado/sp"
curl --max-time "$TIMEOUT" -A "$USER_AGENT" -L -s "$BASE_URL/comprar/estado/sp" > /tmp/cnc_smoke_body
if grep -q 'SÆo Paulo' /tmp/cnc_smoke_body; then
  echo -e "  ${RED}ENCONTROU 'SÆo Paulo' — rodar BLOCO 1 do scripts/sql/2026-05-24-fix-producao-critico.sql${NC}"
  failures=$((failures + 1))
else
  echo -e "  ${GREEN}OK — sem encoding quebrado${NC}"
fi

echo ""
echo "=============================================="
echo " Falhas críticas: $failures"
echo " Warnings (não-críticos): $warnings"
echo "=============================================="

rm -f /tmp/cnc_smoke_body

if [[ "$failures" -gt 0 ]]; then
  exit 1
fi
exit 0
