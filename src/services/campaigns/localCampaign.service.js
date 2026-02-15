const { gerarTextoCampanhaIA } = require("../strategy/message.service");

/* =====================================================
   CRIAR CAMPANHA LOCAL
===================================================== */
async function criarCampanhaLocal(cidade, db) {
  try {
    console.log(`📢 Criando campanha local para ${cidade.name}`);

    // 1) Gerar mensagem com IA
    const mensagem = await gerarTextoCampanhaIA(cidade);

    // 2) Criar campanha no banco
    const result = await db.query(
      `
      INSERT INTO autopilot_campaigns
      (city_id, type, message, status, created_at)
      VALUES ($1, 'social', $2, 'active', NOW())
      RETURNING *
      `,
      [cidade.id, mensagem]
    );

    console.log(`✅ Campanha criada para ${cidade.name}`);

    return result.rows[0];
  } catch (err) {
    console.error("❌ Erro ao criar campanha:", err);
    return null;
  }
}

module.exports = {
  criarCampanhaLocal,
};
