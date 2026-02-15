const { sendWhatsAppLead } = require("../whatsapp.service");

async function distribuirLead(lead, db) {
  try {
    if (!lead || !lead.city_id) {
      console.warn("⚠️ Lead inválido, distribuição cancelada");
      return;
    }

    // 1) Buscar lojistas ativos da cidade
    const result = await db.query(
      `
      SELECT
        a.id,
        a.name,
        a.whatsapp,
        a.plan_type,
        a.priority_level,
        a.last_lead_at
      FROM advertisers a
      WHERE a.city_id = $1
        AND a.status = 'active'
      `,
      [lead.city_id]
    );

    let lojistas = result.rows;

    if (!lojistas || lojistas.length === 0) {
      console.log("⚠️ Nenhum lojista ativo para a cidade", lead.city_id);
      return;
    }

    // 2) Ordenação estratégica
    lojistas.sort((a, b) => {
      const planoPeso = {
        dominant: 3,
        pro: 2,
        basic: 1,
      };

      const pesoA = planoPeso[a.plan_type] || 0;
      const pesoB = planoPeso[b.plan_type] || 0;

      // prioridade por plano
      if (pesoA !== pesoB) return pesoB - pesoA;

      // prioridade manual
      const priorityA = a.priority_level || 0;
      const priorityB = b.priority_level || 0;
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }

      // quem está há mais tempo sem lead
      const lastA = a.last_lead_at
        ? new Date(a.last_lead_at).getTime()
        : 0;
      const lastB = b.last_lead_at
        ? new Date(b.last_lead_at).getTime()
