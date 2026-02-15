const { addWhatsAppJob } = require("../../queues/whatsapp.queue");

/* =====================================================
   SIMULA BUSCA DE LOJAS
   (Depois pode integrar Google Maps API)
===================================================== */
async function buscarLojasCidade(cidade) {
  // Simulação inicial
  // Depois: integração com Google Places API
  return [
    {
      name: `Auto ${cidade.name} Veículos`,
      phone: "11999999999",
    },
    {
      name: `Top Carros ${cidade.name}`,
      phone: "11888888888",
    },
  ];
}

/* =====================================================
   GERA MENSAGEM DE AQUISIÇÃO
===================================================== */
function gerarMensagemAquisicao(cidade) {
  return `🚗 Olá!

Estamos conectando compradores de carros diretamente com lojistas de ${cidade.name}.

Já temos pessoas procurando veículos na sua região e sua loja pode receber esses contatos.

Quer receber compradores interessados diretamente no seu WhatsApp?`;
}

/* =====================================================
   FUNÇÃO PRINCIPAL
===================================================== */
async function ativarAquisicaoDeLojistas(cidade, db) {
  try {
    console.log(`🏪 Aquisição de lojistas em ${cidade.name}`);

    const leads = await buscarLojasCidade(cidade);

    for (const loja of leads) {
      // 1) Verificar se já existe no banco
      const exists = await db.query(
        `
        SELECT id FROM dealer_leads
        WHERE lead_phone = $1
        LIMIT 1
        `,
        [loja.phone]
      );

      if (exists.rows.length > 0) {
        continue;
      }

      // 2) Gerar mensagem
      const mensagem = gerarMensagemAquisicao(cidade);

      // 3) Enviar via fila de WhatsApp
      await addWhatsAppJob({
        phone: loja.phone,
        lead: {
          name: loja.name,
          phone: loja.phone,
          price_range: "lead comercial",
        },
      });

      // 4) Salvar no banco
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
        VALUES (NULL, $1, $2, $3, $4, NOW())
        `,
        [loja.name, loja.phone, "aquisição", cidade.id]
      );

      console.log(`📩 Contato enviado para ${loja.name}`);
    }
  } catch (err) {
    console.error("❌ Erro na aquisição de lojistas:", err);
  }
}

module.exports = {
  ativarAquisicaoDeLojistas,
};
