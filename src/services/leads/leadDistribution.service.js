const { addWhatsAppJob } = require("../../queues/whatsapp.queue");

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
        : 0;

      return lastA - lastB;
    });

    // 3) Selecionar top lojistas
    const MAX_LOJISTAS = 3;
    const selecionados = lojistas.slice(0, MAX_LOJISTAS);

    for (const lojista of selecionados) {
      // Registrar lead no banco
      await db.query(
        `
        INSERT INTO dealer_leads
        (
          advertiser_id,
          lead_name,
          lead_phone,
          lead_price_range,
          city_id,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        `,
        [
          lojista.id,
          lead.name || null,
          lead.phone || null,
          lead.price_range || null,
          lead.city_id,
        ]
      );

      // Atualizar timestamp do último lead
      await db.query(
        `
        UPDATE advertisers
        SET last_lead_at = NOW()
        WHERE id = $1
        `,
        [lojista.id]
      );

      // Enviar WhatsApp via fila
      if (lojista.whatsapp) {
        await addWhatsAppJob({
          phone: lojista.whatsapp,
          lead: {
            name: lead.name,
            phone: lead.phone,
            price_range: lead.price_range,
          },
        });
      }
    }

    console.log(
      `📩 Lead distribuído para ${selecionados.length} lojistas`
    );
  } catch (err) {
    console.error("❌ Erro ao distribuir lead:", err);
  }
}

module.exports = {
  distribuirLead,
};
