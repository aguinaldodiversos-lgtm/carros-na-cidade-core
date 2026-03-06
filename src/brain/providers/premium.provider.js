import axios from "axios";

export class PremiumAiProvider {
  constructor({ logger }) {
    this.logger = logger;
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL_TEXT || "gpt-4o-mini";
    this.timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 25000);
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async generate({ prompt }) {
    if (!this.isConfigured()) {
      throw new Error("OPENAI_API_KEY não configurado");
    }

    const t0 = Date.now();

    const res = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: this.model,
        input: [
          {
            role: "system",
            content:
              "Você é um assistente especializado em automotivo e marketplace. Responda em pt-BR. Seja objetivo.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_output_tokens: 400,
      },
      {
        timeout: this.timeoutMs,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
      }
    );

    const latencyMs = Date.now() - t0;

    const text =
      res.data?.output_text ||
      res.data?.output?.[0]?.content?.[0]?.text ||
      "";

    return {
      provider: "premium",
      model: this.model,
      latencyMs,
      output: text,
      meta: { id: res.data?.id },
      costUsdEstimate: 0,
    };
  }
}
