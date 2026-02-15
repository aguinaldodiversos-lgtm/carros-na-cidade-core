require("dotenv").config();
const { Worker } = require("bullmq");
const IORedis = require("ioredis");

const { sendWhatsAppLead } = require("../services/whatsapp.service");

const connection = new IORedis(process.env.REDIS_URL);

const worker = new Worker(
  "whatsapp",
  async (job) => {
    try {
      const { phone, lead } = job.data;

      if (!phone || !lead) {
        console.warn("⚠️ Job inválido, ignorando...");
        return;
      }

      console.log("📤 Enviando WhatsApp para", phone);

      await sendWhatsAppLead(phone, lead);
    } catch (err) {
      console.error("❌ Erro no worker de WhatsApp:", err.message);
      throw err;
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`✅ Mensagem enviada (job ${job.id})`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Falha no job ${job.id}:`, err.message);
});

console.log("📲 WhatsApp worker iniciado");
