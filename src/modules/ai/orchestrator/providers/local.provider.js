import axios from "axios";

export class LocalAiProvider {
  constructor({ logger }) {
    this.logger = logger;
    this.baseUrl = process.env.AI_LOCAL_URL; // VPS gateway
    this.apiKey = process.env.AI_LOCAL_API_KEY || "";
    this.timeoutMs = Number(process.env.AI_LOCAL_TIMEOUT_MS || 20000);
  }

  isConfigured() {
    return Boolean(this.baseUrl);
  }

  async generate({ task, prompt, context }) {
    if (!this.isConfigured()) {
      throw new Error("AI_LOCAL_URL não configurado");
    }

    const t0 = Date.now();
    const res = await axios.post(
      this.baseUrl,
      {
        task,
        prompt,
        context,
      },
      {
        timeout: this.timeoutMs,
        headers: {
          "content-type": "application/json",
          "x-ai-key": this.apiKey,
        },
      }
    );

    const latencyMs = Date.now() - t0;

    return {
      provider: "local",
      model: res.data?.model || "local",
      latencyMs,
      output: res.data?.output ?? res.data,
      meta: res.data?.meta || {},
      costUsdEstimate: 0,
    };
  }
}
