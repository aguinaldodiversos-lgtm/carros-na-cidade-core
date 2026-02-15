const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis(process.env.REDIS_URL);

const whatsappQueue = new Queue("whatsapp", {
  connection,
});

async function addWhatsAppJob(data) {
  await whatsappQueue.add("send-message", data, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

module.exports = {
  whatsappQueue,
  addWhatsAppJob,
};
