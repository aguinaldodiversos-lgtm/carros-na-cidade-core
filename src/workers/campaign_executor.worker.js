import { pool } from "../infrastructure/database/db.js";
import { sendWhatsAppMessage } from "../services/whatsapp.service.js";

async function executeDealerAcquisition(cityId) {
  console.log(`📞 Aquisição de lojistas para cidade ${cityId}`);

  // 1) Buscar lojistas da cidade
  const dealersResult = await pool.query(
    `
    SELECT id, name, phone
    FROM advertisers
    WHERE city_id = $1
    AND phone IS NOT NULL
    LIMIT 10
  `,
    [cityId]
  );

  const dealers = dealersResult.rows;

  if (dealers.length === 0) {
    console.log("⚠️ Nenhum lojista encontrado para essa cidade");
    return;
  }

  for (const dealer of dealers) {
    try {
      const message = `Olá ${dealer.name}! 👋

Aqui é do portal *Carros na Cidade*.

Percebemos alta procura por veículos na sua cidade e poucos anúncios disponíveis.

Você pode anunciar gratuitamente e receber contatos diretos de compradores locais.

Cadastre seus veículos:
https://carrosnacidade.com/painel`;

      await sendWhatsAppMessage(dealer.phone, message);

      // Registrar ação
      await pool.query(
        `
        INSERT INTO autopilot_actions (
          city_id,
          action_type,
          status,
          metadata,
          created_at
        )
        VALUES ($1, 'dealer_whatsapp', 'sent', $2, NOW())
      `,
        [cityId, JSON.stringify({ advertiser_id: dealer.id })]
      );

      console.log(`✅ WhatsApp enviado para ${dealer.name}`);
    } catch (err) {
      console.error(`❌ Erro ao enviar para ${dealer.name}:`, err);
    }
  }
}
