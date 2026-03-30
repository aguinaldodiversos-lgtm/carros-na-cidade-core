import axios from "axios";

function extractResponsesOutputText(data) {
  if (!data || typeof data !== "object") return "";
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const out0 = data.output?.[0];
  if (out0?.type === "message" && Array.isArray(out0.content)) {
    const textPart = out0.content.find((c) => c.type === "output_text" || c.type === "text");
    if (typeof textPart?.text === "string") return textPart.text.trim();
  }
  const legacy = data.output?.[0]?.content?.[0]?.text;
  if (typeof legacy === "string") return legacy.trim();
  return "";
}

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

    const text = extractResponsesOutputText(res.data) || "";

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
