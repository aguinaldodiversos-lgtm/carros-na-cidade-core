const axios = require("axios");

async function publishToInternalChannel(postText) {
  // Placeholder para log ou integração futura
  console.log("📢 Publicando post:");
  console.log(postText);

  return true;
}

async function publishToWebhook(postText) {
  if (!process.env.SOCIAL_WEBHOOK_URL) {
    return false;
  }

  try {
    await axios.post(process.env.SOCIAL_WEBHOOK_URL, {
      text: postText,
    });

    return true;
  } catch (err) {
    console.error("Erro no webhook social:", err.message);
    return false;
  }
}

async function publishPost(post) {
  // Estratégia de publicação
  // Pode expandir para Facebook, Instagram, Telegram etc.

  // 1) Canal interno (log)
  await publishToInternalChannel(post.post_text);

  // 2) Webhook externo (opcional)
  await publishToWebhook(post.post_text);

  return true;
}

module.exports = { publishPost };
