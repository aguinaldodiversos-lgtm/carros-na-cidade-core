import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ALL_EVENT_KEYS = [
  "EVENTS_ENABLED",
  "EVENTS_PUBLIC_ENABLED",
  "EVENTS_CREATION_ENABLED",
  "EVENTS_PAYMENTS_ENABLED",
  "EVENTS_WORKER_ENABLED",
  "EVENTS_AI_BANNER_ENABLED",
];

let savedEnv = {};

beforeEach(() => {
  vi.resetModules();
  savedEnv = {};
  for (const k of ALL_EVENT_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function loadFeatures() {
  return await import("./features.js");
}

describe("features — flags EVENTS_* (default fechado)", () => {
  it("sem nenhuma var definida → todas as flags de Events são false", async () => {
    const { features } = await loadFeatures();
    expect(features.eventsEnabled).toBe(false);
    expect(features.eventsPublicEnabled).toBe(false);
    expect(features.eventsCreationEnabled).toBe(false);
    expect(features.eventsPaymentsEnabled).toBe(false);
    expect(features.eventsWorkerEnabled).toBe(false);
    expect(features.eventsAiBannerEnabled).toBe(false);
  });

  it("EVENTS_ENABLED='true' (lowercase exato) → eventsEnabled=true", async () => {
    process.env.EVENTS_ENABLED = "true";
    const { features } = await loadFeatures();
    expect(features.eventsEnabled).toBe(true);
  });

  it("EVENTS_ENABLED='TRUE' (uppercase) → continua false (strict)", async () => {
    process.env.EVENTS_ENABLED = "TRUE";
    const { features } = await loadFeatures();
    expect(features.eventsEnabled).toBe(false);
  });

  it("EVENTS_ENABLED='1' → continua false (strict não aceita numérico)", async () => {
    process.env.EVENTS_ENABLED = "1";
    const { features } = await loadFeatures();
    expect(features.eventsEnabled).toBe(false);
  });

  it("EVENTS_ENABLED='yes' / 'on' / 'y' → continua false", async () => {
    for (const v of ["yes", "on", "y"]) {
      vi.resetModules();
      process.env.EVENTS_ENABLED = v;
      const { features } = await loadFeatures();
      expect(features.eventsEnabled).toBe(false);
    }
  });

  it("EVENTS_ENABLED='' (vazio) → false", async () => {
    process.env.EVENTS_ENABLED = "";
    const { features } = await loadFeatures();
    expect(features.eventsEnabled).toBe(false);
  });
});

describe("isEventsDomainEnabled — composição com master kill-switch", () => {
  it("EVENTS_ENABLED=false (master off) → todos os domínios retornam false MESMO se a flag específica for true", async () => {
    process.env.EVENTS_ENABLED = "false";
    process.env.EVENTS_PUBLIC_ENABLED = "true";
    process.env.EVENTS_CREATION_ENABLED = "true";
    process.env.EVENTS_PAYMENTS_ENABLED = "true";
    process.env.EVENTS_WORKER_ENABLED = "true";
    process.env.EVENTS_AI_BANNER_ENABLED = "true";
    const { isEventsDomainEnabled } = await loadFeatures();
    for (const d of ["public", "creation", "payments", "worker", "ai_banner"]) {
      expect(isEventsDomainEnabled(d)).toBe(false);
    }
  });

  it("master=true E flag específica=true → domínio liberado", async () => {
    process.env.EVENTS_ENABLED = "true";
    process.env.EVENTS_PUBLIC_ENABLED = "true";
    const { isEventsDomainEnabled } = await loadFeatures();
    expect(isEventsDomainEnabled("public")).toBe(true);
    expect(isEventsDomainEnabled("creation")).toBe(false); // não setada
  });

  it("domínio desconhecido → false (failsafe)", async () => {
    process.env.EVENTS_ENABLED = "true";
    const { isEventsDomainEnabled } = await loadFeatures();
    expect(isEventsDomainEnabled("not_a_domain")).toBe(false);
  });
});
