const { Pool } = require("pg");
const { sendWhatsAppAlert } = require("./whatsapp.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function generateCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

async function sendPhoneVerification(userId, phone) {
  const code = generateCode();
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

  await pool.query(
    `
    UPDATE users
    SET
      phone = $1,
      phone_verification_code = $2,
      phone_code_expires = $3,
      phone_verified = false
    WHERE id = $4
    `,
    [phone, code, expires, userId]
  );

  const message = `
Seu código de verificação do Carros na Cidade é:

${code}

Válido por 10 minutos.
`;

  await sendWhatsAppAlert(phone, {
    message_override: message,
  });

  return true;
}

async function confirmPhoneCode(userId, code) {
  const result = await pool.query(
    `
    SELECT phone_verification_code, phone_code_expires
    FROM users
    WHERE id = $1
    `,
    [userId]
  );

  const user = result.rows[0];

  if (!user) return false;

  if (user.phone_verification_code !== code) {
    return false;
  }

  if (new Date() > new Date(user.phone_code_expires)) {
    return false;
  }

  await pool.query(
    `
    UPDATE users
    SET
      phone_verified = true,
      phone_verification_code = NULL,
      phone_code_expires = NULL
    WHERE id = $1
    `,
    [userId]
  );

  return true;
}

module.exports = {
  sendPhoneVerification,
  confirmPhoneCode,
};
