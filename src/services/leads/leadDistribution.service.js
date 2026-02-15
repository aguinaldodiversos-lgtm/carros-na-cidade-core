async function distribuirLead(lead, db) {
  try {
    // 1) Buscar lojistas ativos da cidade
    const result = await db.query(
      `
      SELECT
        a.id,
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

    if (lojistas.length === 0) {
      console.log("⚠️ Nenhum lojista ativo para a cidade", lead.city_id);
      return;
    }

    // 2) Ordenar lojistas
    lojistas.sort((a, b) => {
      // prioridade por plano
      const planoPeso = {
        dominant: 3,
        pro: 2,
        basic: 1,
      };

      const pesoA = planoPeso[a.plan_type] || 0;
      const pesoB = planoPeso[b.plan_type] || 0;

      if (pesoA !== pesoB) return pesoB - pesoA;

      // prioridade manual
      if (a.priority_level !== b.priority_level) {
        return b.priority_level - a.priority_level;
      }

      // quem está há mais tempo sem lead
      const lastA = a.last_lead_at
        ? new Date(a.last_lead_at).getTime()
        : 0;
      const lastB = b.last_lead_at
        ? new Date(b.last_lead_at).getTime()
        : 0;

      return lastA - lastB;
    });

    // 3) Selecionar top N lojistas
    const MAX_LOJISTAS = 3;
    const selecionados = lojistas.slice(0, MAX_LOJISTAS);

    for (const lojista of selecionados) {
      // registrar lead distribuído
      await db.query(
        `
        INSERT INTO dealer_leads
        (advertiser_id, lead_name, lead_phone, lead_price_range, city_id, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        `,
        [
          lojista.id,
          lead.name,
          lead.phone,
          lead.price_range,
          lead.city_id,
        ]
      );

      // atualizar timestamp do último lead
      await db.query(
        `
        UPDATE advertisers
        SET last_lead_at = NOW()
        WHERE id = $1
        `,
        [lojista.id]
      );
    }

    console.log(
      `📩 Lead distribuído para ${selecionados.length} lojistas`
    );
  } catch (err) {
    console.error("Erro ao distribuir lead:", err);
  }
}

module.exports = {
  distribuirLead,
};
