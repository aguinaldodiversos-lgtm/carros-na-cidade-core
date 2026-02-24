// src/modules/finance/roi.service.js

import { pool } from "../../infrastructure/database/db.js";

/* =====================================================
   CONFIGURAÇÕES
===================================================== */

// Receita média estimada por lead convertido
// (pode futuramente vir de system_settings)
const DEFAULT_REVENUE_PER_LEAD = 50;

/* =====================================================
   CALCULAR ROI COMPLETO POR CIDADE
===================================================== */

export async function calculateCityROI(cityId) {
  if (!cityId) {
    throw new Error("cityId é obrigatório para cálculo de ROI");
  }

  /* ===============================
     1️⃣ GASTO TOTAL EM MÍDIA
  =============================== */

  const spendResult = await pool.query(
    `
    SELECT COALESCE(SUM(spend),0) as total_spend
    FROM payments
    WHERE city_id = $1
      AND status = 'approved'
    `,
    [cityId]
  );

  const spend = Number(spendResult.rows[0]?.total_spend || 0);

  /* ===============================
     2️⃣ TOTAL DE LEADS GERADOS
  =============================== */

  const leadsResult = await pool.query(
    `
    SELECT COUNT(*) as total_leads
    FROM leads
    WHERE city_id = $1
    `,
    [cityId]
  );

  const totalLeads = Number(leadsResult.rows[0]?.total_leads || 0);

  /* ===============================
     3️⃣ RECEITA ESTIMADA
  =============================== */

  const estimatedRevenue = totalLeads * DEFAULT_REVENUE_PER_LEAD;

  /* ===============================
     4️⃣ MÉTRICAS FINANCEIRAS
  =============================== */

  const roas = spend > 0 ? estimatedRevenue / spend : 0;

  const cpa = totalLeads > 0 ? spend / totalLeads : 0;

  const roi = spend > 0
    ? (estimatedRevenue - spend) / spend
    : 0;

  /* ===============================
     5️⃣ UPSERT NA TABELA city_roi_metrics
  =============================== */

  await pool.query(
    `
    INSERT INTO city_roi_metrics
    (city_id, ad_spend, revenue, roas, cpa, roi, last_updated)
    VALUES ($1,$2,$3,$4,$5,$6,NOW())
    ON CONFLICT (city_id)
    DO UPDATE SET
      ad_spend = EXCLUDED.ad_spend,
      revenue = EXCLUDED.revenue,
      roas = EXCLUDED.roas,
      cpa = EXCLUDED.cpa,
      roi = EXCLUDED.roi,
      last_updated = NOW()
    `,
    [
      cityId,
      spend,
      estimatedRevenue,
      roas,
      cpa,
      roi,
    ]
  );

  /* ===============================
     6️⃣ ATUALIZAR city_metrics
  =============================== */

  await pool.query(
    `
    UPDATE city_metrics
    SET roi_score = $1,
        updated_at = NOW()
    WHERE city_id = $2
    `,
    [roi, cityId]
  );

  return {
    city_id: cityId,
    spend,
    total_leads: totalLeads,
    estimated_revenue: estimatedRevenue,
    roas: Number(roas.toFixed(4)),
    cpa: Number(cpa.toFixed(2)),
    roi: Number(roi.toFixed(4)),
  };
}
