import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  refuseIfEventsWorkerDisabled,
  refuseIfAiBannerDisabled,
} from "./_events_guard.cjs";

const ALL_KEYS = [
  "EVENTS_ENABLED",
  "EVENTS_WORKER_ENABLED",
  "EVENTS_AI_BANNER_ENABLED",
];

let saved = {};
beforeEach(() => {
  saved = {};
  for (const k of ALL_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("refuseIfEventsWorkerDisabled — kill-switch worker", () => {
  it("sem env → recusa (true) e loga", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(refuseIfEventsWorkerDisabled("event_scheduler")).toBe(true);
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain("event_scheduler");
    expect(log.mock.calls[0][0]).toContain("DESLIGADO");
    log.mockRestore();
  });

  it("EVENTS_ENABLED=true mas EVENTS_WORKER_ENABLED ausente → recusa", () => {
    process.env.EVENTS_ENABLED = "true";
    expect(refuseIfEventsWorkerDisabled("x")).toBe(true);
  });

  it("EVENTS_WORKER_ENABLED=true mas EVENTS_ENABLED ausente → recusa (master vence)", () => {
    process.env.EVENTS_WORKER_ENABLED = "true";
    expect(refuseIfEventsWorkerDisabled("x")).toBe(true);
  });

  it("ambos = 'true' (lowercase exato) → libera", () => {
    process.env.EVENTS_ENABLED = "true";
    process.env.EVENTS_WORKER_ENABLED = "true";
    expect(refuseIfEventsWorkerDisabled("x")).toBe(false);
  });

  it("ambos com valor 'TRUE' → recusa (strict)", () => {
    process.env.EVENTS_ENABLED = "TRUE";
    process.env.EVENTS_WORKER_ENABLED = "TRUE";
    expect(refuseIfEventsWorkerDisabled("x")).toBe(true);
  });

  it("ambos = '1' → recusa (strict)", () => {
    process.env.EVENTS_ENABLED = "1";
    process.env.EVENTS_WORKER_ENABLED = "1";
    expect(refuseIfEventsWorkerDisabled("x")).toBe(true);
  });
});

describe("refuseIfAiBannerDisabled — kill-switch DALL-E", () => {
  it("sem env → recusa (não chama OpenAI)", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(refuseIfAiBannerDisabled("banner_generator")).toBe(true);
    expect(log.mock.calls[0][0]).toContain("DALL-E NÃO chamada");
    log.mockRestore();
  });

  it("EVENTS_ENABLED=true e EVENTS_AI_BANNER_ENABLED=true → libera", () => {
    process.env.EVENTS_ENABLED = "true";
    process.env.EVENTS_AI_BANNER_ENABLED = "true";
    expect(refuseIfAiBannerDisabled("x")).toBe(false);
  });

  it("master off, AI on → recusa (master kills tudo)", () => {
    process.env.EVENTS_ENABLED = "false";
    process.env.EVENTS_AI_BANNER_ENABLED = "true";
    expect(refuseIfAiBannerDisabled("x")).toBe(true);
  });
});
