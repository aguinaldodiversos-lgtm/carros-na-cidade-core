const express = require("express");

const app = express();
app.use(express.json());

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.send("Carros na Cidade API OK");
});

/* =========================
   TABELA FIPE (BASE)
========================= */
app.get("/api/fipe", async (req, res) => {
  try {
    const { tipo, marca, modelo, ano } = req.query;

    if (!tipo || !marca || !modelo || !ano) {
      return res.status(400).json({
        erro: "Informe tipo, marca, modelo e ano"
      });
    }

    res.json({
      mensagem: "Consulta FIPE recebida",
      dados: { tipo, marca, modelo, ano }
    });

  } catch (error) {
    res.status(500).json({ erro: "Erro interno" });
  }
});

/* =========================
   SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Carros na Cidade rodando na porta", PORT);
});
