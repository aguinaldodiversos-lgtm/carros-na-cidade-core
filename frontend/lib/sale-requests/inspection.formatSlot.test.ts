import { afterAll, describe, expect, it } from "vitest";

import { formatSlot, formatSlotShort } from "@/lib/sale-requests/inspection";

/**
 * O CONTRATO DE FUSO DO AGENDAMENTO — provado, não presumido.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO AFIRMA
 * ════════════════════════════════════════════════════════════════════════════
 * `formatSlot` NÃO fixa `timeZone`, e isso é deliberado (ver o bloco de
 * documentação em `inspection.ts`): o horário de uma avaliação é um COMPROMISSO
 * entre duas pessoas, e cada uma tem de lê-lo no relógio da própria parede.
 * Fixar `America/Sao_Paulo` erraria em toda cidade fora do fuso de Brasília —
 * Manaus (UTC−4), Rio Branco (UTC−5), Fernando de Noronha (UTC−2).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARQUIVO PRECISOU EXISTIR
 * ════════════════════════════════════════════════════════════════════════════
 * `components/account/SaleRequestScheduling.test.tsx` afirmava horários de
 * parede (`"25/08 às 10:00"`) sem dizer de qual parede. Passava na máquina de
 * quem escreveu (UTC−3) e falhava no runner do CI (UTC) por exatamente 3 horas.
 *
 * A tentação óbvia era trocar `10:00` por `13:00` no teste. Isso teria
 * transformado o fuso do runner em contrato — e o produto passaria a "definir"
 * que a hora da avaliação é a hora de Londres.
 *
 * A correção certa foi declarar o fuso lá, e provar AQUI que a dependência de
 * fuso é a intenção do domínio e não um acidente. Este arquivo é a única razão
 * pela qual aquela linha `process.env.TZ = "America/Sao_Paulo"` pode ser lida
 * como decisão em vez de remendo.
 */

const TZ_ORIGINAL = process.env.TZ;

afterAll(() => {
  if (TZ_ORIGINAL === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_ORIGINAL;
});

/** Roda `fn` com o fuso do processo fixado, e devolve o fuso ao fim. */
function comFuso<T>(timeZone: string, fn: () => T): T {
  const anterior = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return fn();
  } finally {
    if (anterior === undefined) delete process.env.TZ;
    else process.env.TZ = anterior;
  }
}

/**
 * A loja de Atibaia (UTC−3) marcou 10:00. É o mesmo INSTANTE em todo lugar do
 * planeta; o que muda é o número que cada relógio mostra.
 */
const SLOT_ATIBAIA_10H = "2026-08-25T10:00:00-03:00";

describe("formatSlot — segue o fuso de quem lê (contrato deliberado)", () => {
  it("em America/Sao_Paulo (UTC−3), 10:00−03:00 aparece como 10:00", () => {
    const saida = comFuso("America/Sao_Paulo", () => formatSlot(SLOT_ATIBAIA_10H));
    expect(saida).toContain("25/08");
    expect(saida).toContain("10:00");
  });

  it("em UTC, o MESMO instante aparece como 13:00", () => {
    // Não é bug: às 10:00 de Atibaia, o relógio de parede em Londres marca 13:00.
    const saida = comFuso("UTC", () => formatSlot(SLOT_ATIBAIA_10H));
    expect(saida).toContain("25/08");
    expect(saida).toContain("13:00");
  });

  it("em America/Manaus (UTC−4), aparece como 09:00", () => {
    // O caso que a documentação usa como razão para NÃO fixar o fuso: um
    // proprietário em Manaus lendo um horário marcado por uma loja em Atibaia.
    const saida = comFuso("America/Manaus", () => formatSlot(SLOT_ATIBAIA_10H));
    expect(saida).toContain("25/08");
    expect(saida).toContain("09:00");
  });

  it("o INSTANTE é o mesmo nos três fusos — só o rótulo muda", () => {
    // A prova de que a variação é de apresentação, e não de dado: o epoch é
    // idêntico. Se algum dia alguém "corrigir" o formatter somando ou
    // subtraindo horas do valor, esta asserção quebra.
    const epochs = ["America/Sao_Paulo", "UTC", "America/Manaus"].map((tz) =>
      comFuso(tz, () => new Date(SLOT_ATIBAIA_10H).getTime())
    );
    expect(new Set(epochs).size).toBe(1);
  });

  it("a virada de dia acompanha o fuso, não o texto do ISO", () => {
    // 23:30 em Atibaia já é 02:30 do DIA SEGUINTE em UTC. Um formatter que
    // recortasse a data do ISO por string mostraria 25/08 aqui — e erraria.
    const tarde = "2026-08-25T23:30:00-03:00";
    expect(comFuso("America/Sao_Paulo", () => formatSlot(tarde))).toContain("25/08");
    expect(comFuso("UTC", () => formatSlot(tarde))).toContain("26/08");
  });
});

describe("formatSlotShort — mesma regra, formato curto", () => {
  it("acompanha o fuso do leitor", () => {
    expect(comFuso("America/Sao_Paulo", () => formatSlotShort(SLOT_ATIBAIA_10H))).toBe(
      "25/08 às 10:00"
    );
    expect(comFuso("UTC", () => formatSlotShort(SLOT_ATIBAIA_10H))).toBe("25/08 às 13:00");
  });
});

describe("formatSlot — entrada inválida", () => {
  it("devolve string vazia em vez de 'Invalid Date'", () => {
    // A tela não pode receber um `Invalid Date` disfarçado de texto.
    expect(formatSlot("não é uma data")).toBe("");
    expect(formatSlotShort("")).toBe("");
  });
});
