const { Pool } = require("pg");
const { verifyDocument } = require("../../services/documents/documentVerification.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function verifyUserDocument(req, res) {
  try {
    const userId = req.user.id;
    const { document_type, document_number } = req.body;

    if (!document_type || !document_number) {
      return res.status(400).json({
        error: "Documento não informado",
      });
    }

    if (!["cpf", "cnpj"].includes(document_type)) {
      return res.status(400).json({
        error: "Tipo de documento inválido",
      });
    }

    const result = await verifyDocument({
      type: document_type,
      number: document_number,
    });

    if (!result.valid) {
      return res.status(400).json({
        error: "Documento inválido",
      });
    }

    await pool.query(
      `
      UPDATE users
      SET
        document_type = $1,
        document_number = $2,
        document_verified = true
      WHERE id = $3
      `,
      [document_type, document_number, userId]
    );

    return res.json({
      success: true,
      message: "Documento verificado com sucesso",
      company_name: result.company_name || null,
    });
  } catch (err) {
    console.error("Erro na verificação de documento:", err);
    res.status(500).json({
      error: "Erro interno",
    });
  }
}

module.exports = { verifyUserDocument };
