import { describe, expect, it } from "vitest";

import nextConfig from "./next.config.mjs";

describe("next.config.mjs — guardrails de outbound bandwidth", () => {
  it("images.unoptimized === true (kill switch global)", () => {
    // Enquanto a flag estiver ligada, /_next/image NÃO é gerado para nenhuma
    // imagem do app. Remover só depois de converter os 8 bypasses listados
    // em docs/runbooks/vehicle-images-bandwidth-incident.md.
    expect(nextConfig.images?.unoptimized).toBe(true);
  });

  it("remotePatterns NÃO contém wildcard '**' (qualquer HTTPS)", () => {
    const patterns = nextConfig.images?.remotePatterns ?? [];
    for (const p of patterns) {
      expect(
        p.hostname,
        "hostname='**' permite o otimizador puxar imagens de qualquer host pelo Render — proibido"
      ).not.toBe("**");
    }
  });

  it("remotePatterns só contém hosts conhecidos e safe", () => {
    const patterns = nextConfig.images?.remotePatterns ?? [];
    const hosts = patterns.map((p) => p.hostname);
    // Lista white-list controlada. Adicionar host aqui exige justificar
    // outbound bandwidth (cada otimização puxa do origin pelo Render).
    const ALLOWED = new Set(["images.unsplash.com", "localhost"]);
    for (const host of hosts) {
      expect(ALLOWED.has(host), `host não revisado em remotePatterns: ${host}`).toBe(true);
    }
  });
});
