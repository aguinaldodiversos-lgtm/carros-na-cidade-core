require("dotenv").config();
const { Pool } = require("pg");
const { sendWhatsAppAlert } = require("../services/whatsapp.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function buildFollowupMessage(step, cityName) {
  if (step === 1) {
    return `Olá! Vi que você trabalha com veículos em ${cityName}.

O Carros na Cidade está trazendo compradores locais diretamente para os lojistas da região.

Você pode anunciar gratuitamente aqui:
${process.env.FRONTEND_URL}/painel`;
  }

  if (step === 2) {
    return `Só passando para lembrar 🙂

Estamos ajudando lojistas de ${cityName} a receber contatos diretos de compradores.

Seu cadastro leva menos de 2 minutos:
${process.env.FRONTEND_URL}/painel`;
  }

  if (step === 3) {
    return `Último aviso:

O portal Carros na Cidade está liberando vagas gratuitas para lojistas de ${cityName}.

Se quiser aproveitar:
${process.env.FRONTEND_URL}/painel`;
  }

  return null;
}

async function runDealerFollowup() {
  try {
    console.log("📞 Rodando Dealer Follow-up...");

    const leads = await pool.query(`
      SELECT
        dl.id,
        dl.phone,
        dl.city_id,
        c.name AS city_name,
        df.step,
        df.last_sent_at
      FROM dealer_leads dl
      JOIN cities c ON c.id = dl.city_id
      LEFT JOIN dealer_followups df
        ON df.dealer_lead_id = dl.id
      WHERE dl.contacted = true
        AND (df.completed IS NULL OR df.completed = false)
      LIMIT 20
    `);

    for (const lead of leads.rows) {
      let step = lead.step || 1;

      // verificar tempo entre follow-ups
      if (lead.last_sent_at) {
        const diffHours =
          (Date.now() - new Date(lead.last_sent_at).getTime()) /
          (1000 * 60 * 60);

        if (step === 1 && diffHours < 48) continue;
        if (step === 2 && diffHours < 96) continue;
      }

      if (step > 3) {
        await pool.query(
          `
          UPDATE dealer_followups
          SET completed = true
          WHERE dealer_lead_id = $1
        `,
          [lead.id]
        );
        continue;
      }

      const message = buildFollowupMessage(step, lead.city_name);
      if (!message) continue;

      await sendWhatsAppAlert(lead.phone, {
        brand: "",
        model: "",
        year: "",
        price: "",
        city: lead.city_name,
        slug: "",
        id: "",
      });

      // registrar envio
      await pool.query(
        `
        INSERT INTO dealer_followups (
          dealer_lead_id,
          step,
          last_sent_at
        )
        VALUES ($1,$2,NOW())
        ON CONFLICT (dealer_lead_id)
        DO UPDATE SET
          step = dealer_followups.step + 1,
          last_sent_at = NOW()
      `,
        [lead.id, step]
      );

      console.log(`📩 Follow-up enviado para lead ${lead.id}`);
    }

    console.log("✅ Follow-up finalizado");
  } catch (err) {
    console.error("❌ Erro no follow-up:", err);
  }
}

function startDealerFollowupWorker() {
  setInterval(runDealerFollowup, 60 * 60 * 1000); // a cada 1 hora
  runDealerFollowup();
}

module.exports = { startDealerFollowupWorker };
