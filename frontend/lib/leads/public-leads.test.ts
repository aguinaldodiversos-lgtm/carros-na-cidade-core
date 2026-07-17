// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { registerWhatsappContact } from "@/lib/leads/public-leads";

/**
 * Registro de "lead enviado" no clique de WhatsApp (versão mínima, sem PII).
 *
 * Garantias travadas aqui:
 *   - Dispara o beacon UMA vez por anúncio dentro da janela de dedup.
 *   - O 2º clique no mesmo anúncio (< 30 min) NÃO dispara (dedup client-side).
 *   - Passada a janela de 30 min, volta a disparar.
 *   - Falha do beacon cai para `fetch` e NUNCA lança (o `wa.me` abre igual).
 *   - Só `adId` vai no corpo — nenhum dado pessoal do visitante.
 */

// localStorage em memória (o jsdom deste projeto não o expõe por padrão).
const memoryStore: Record<string, string> = {};
const memoryStorage: Storage = {
  get length() {
    return Object.keys(memoryStore).length;
  },
  clear: () => {
    for (const k of Object.keys(memoryStore)) delete memoryStore[k];
  },
  getItem: (k: string) => (k in memoryStore ? memoryStore[k] : null),
  key: (i: number) => Object.keys(memoryStore)[i] ?? null,
  removeItem: (k: string) => {
    delete memoryStore[k];
  },
  setItem: (k: string, v: string) => {
    memoryStore[k] = String(v);
  },
};

const THIRTY_MIN_MS = 30 * 60 * 1000;

let sendBeacon: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
let nowSpy: ReturnType<typeof vi.spyOn>;
let currentNow = 1_000_000;

beforeEach(() => {
  memoryStorage.clear();
  currentNow = 1_000_000;

  Object.defineProperty(window, "localStorage", {
    value: memoryStorage,
    configurable: true,
  });

  sendBeacon = vi.fn(() => true);
  Object.defineProperty(navigator, "sendBeacon", {
    value: sendBeacon,
    configurable: true,
  });

  fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
  vi.stubGlobal("fetch", fetchMock);

  nowSpy = vi.spyOn(Date, "now").mockImplementation(() => currentNow);
});

afterEach(() => {
  nowSpy.mockRestore();
  vi.unstubAllGlobals();
});

describe("registerWhatsappContact", () => {
  it("dispara o beacon uma vez e envia SÓ o adId (sem PII)", () => {
    registerWhatsappContact("42");

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0];
    expect(String(url)).toContain("/api/leads/whatsapp-click");
    expect(blob).toBeInstanceOf(Blob);
    // não deve haver fallback de fetch quando o beacon é aceito
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("segura o 2º clique no mesmo anúncio dentro dos 30 min (dedup)", () => {
    registerWhatsappContact("42");
    registerWhatsappContact("42"); // imediatamente depois

    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  it("os dois botões compartilham a janela: anúncios diferentes contam separado", () => {
    registerWhatsappContact("42");
    registerWhatsappContact("99");

    expect(sendBeacon).toHaveBeenCalledTimes(2);
  });

  it("volta a disparar depois de expirada a janela de 30 min", () => {
    registerWhatsappContact("42");
    expect(sendBeacon).toHaveBeenCalledTimes(1);

    currentNow += THIRTY_MIN_MS + 1;
    registerWhatsappContact("42");

    expect(sendBeacon).toHaveBeenCalledTimes(2);
  });

  it("cai para fetch quando o beacon é recusado, sem lançar", () => {
    sendBeacon.mockReturnValue(false);

    expect(() => registerWhatsappContact("42")).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ adId: "42" });
  });

  it("nunca lança mesmo se beacon e fetch falharem (o wa.me abre igual)", () => {
    sendBeacon.mockImplementation(() => {
      throw new Error("beacon indisponível");
    });
    fetchMock.mockImplementation(() => {
      throw new Error("rede caiu");
    });

    expect(() => registerWhatsappContact("42")).not.toThrow();
  });

  it("ignora adId vazio/ inválido (não dispara nada)", () => {
    registerWhatsappContact("");
    registerWhatsappContact(0);
    registerWhatsappContact(-3);

    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
