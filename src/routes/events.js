const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const mercadopago = require("mercadopago");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN,
});

/* =====================================================
   UTILS
===================================================== */
function getNextMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (8 - day) % 7;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* =====================================================
   CREATE EVENT
===================================================== */
router.post("/", async (req, res) => {
  try {
    const {
      advertiser_id,
      city_id,
      title,
      event_type,
      location,
    } = req.body;

    // 1) verificar lojista
    const adv = await pool.query(
      `SELECT verified FROM advertisers WHERE id = $1`,
      [advertiser_id]
    );

    if (!adv.rows.length || !adv.rows[0].verified) {
      return res.status(403).json({
        error: "Lojista não verificado",
      });
    }

    // 2) encontrar próxima semana disponível
    let weekStart = getNextMonday();
    let slot = null;
    let found = false;

    for (let i = 0; i < 4; i++) {
      const result = await pool.query(
        `
        SELECT slot
        FROM event_queue
        WHERE city_id = $1
        AND week_start = $2
        `,
        [city_id, weekStart]
      );

      const usedSlots = result.rows.map((r) => r.slot);

      for (let s = 1; s <= 3; s++) {
        if (!usedSlots.includes(s)) {
          slot = s;
          found = true;
          break;
        }
      }

      if (found) break;

      weekStart.setDate(weekStart.getDate() + 7);
    }

    if (!found) {
      return res.status(400).json({
        error: "Agenda cheia para os próximos 30 dias",
      });
    }

    const startDate = new Date(weekStart);
    const endDate = new Date(weekStart);
    endDate.setDate(endDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    // 3) criar evento
    const eventInsert = await pool.query(
      `
      INSERT INTO events (
        advertiser_id,
        city_id,
        title,
        event_type,
        location,
        week_start,
        start_date,
        end_date,
        status,
        price
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending_payment',499)
      RETURNING *
      `,
      [
        advertiser_id,
        city_id,
        title,
        event_type,
        location,
        weekStart,
        startDate,
        endDate,
      ]
    );

    const event = eventInsert.rows[0];

    // 4) criar pagamento Mercado Pago
    const preference = {
      items: [
        {
          title: `Evento Premium - ${title}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: Number(event.price),
        },
      ],
      notification_url: `${process.env.API_URL}/api/payments/webhook`,
    };

    const payment = await mercadopago.preferences.create(preference);

    // salvar id do pagamento
    await pool.query(
      `UPDATE events SET payment_id = $1 WHERE id = $2`,
      [payment.body.id, event.id]
    );

    res.json({
      event_id: event.id,
      payment_url: payment.body.init_point,
      week_start: weekStart,
      slot,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar evento" });
  }
});

module.exports = router;
