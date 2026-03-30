const { addWhatsAppJob } = require("../../queues/whatsapp.queue");

/* =====================================================
   DISTRIBUIR LEAD PARA LOJISTAS
===================================================== */
async function distribuirLead(lead, db) {
  try {
    if (!lead || !lead.city_id) {
      console.warn("⚠️ Lead inválido, distribuição cancelada");
      return;
    }

    console.log("📨 Distribuindo lead inteligente:", lead.phone);

    // 1) Buscar lojistas ativos na cidade
    const result = await db.query(
      `
      SELECT
        id,
        name,
        whatsapp,
        plan,
        priority,
        last_lead_at
      FROM advertisers
      WHERE city_id = $1
        AND status = 'active'
        AND whatsapp IS NOT NULL
      ORDER BY
        priority DESC,
        plan DESC,
        last_lead_at ASC NULLS FIRST
      LIMIT 3
      `,
      [lead.city_id]
    );

    const lojistas = result.rows;

    if (lojistas.length === 0) {
      console.warn("⚠️ Nenhum lojista ativo para este lead");
      return;
    }

    // 2) Distribuir para os lojistas
    for (const lojista of lojistas) {
      try {
        // Enviar para fila de WhatsApp
        await addWhatsAppJob({
          phone: lojista.whatsapp,
          lead: {
            name: lead.name,
            phone: lead.phone,
            price_range: lead.price_range,
            urgency: lead.urgency,
            payment_type: lead.payment_type,
            usage_type: lead.usage_type,
            trade_in: lead.trade_in,
            preferred_brand: lead.preferred_brand,
            preferred_model: lead.preferred_model,
          },
        });

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
          [lojista.id, lead.name, lead.phone, lead.price_range || null, lead.city_id]
        );

        // Atualizar última entrega de lead
        await db.query(
          `
          UPDATE advertisers
          SET last_lead_at = NOW()
          WHERE id = $1
          `,
          [lojista.id]
        );

        console.log(`📤 Lead enviado para lojista: ${lojista.name}`);
      } catch (err) {
        console.error(`❌ Erro ao enviar lead para ${lojista.name}:`, err.message);
      }
    }
  } catch (err) {
    console.error("❌ Erro na distribuição de lead:", err);
  }
}

module.exports = {
  distribuirLead,
};
