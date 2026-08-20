import { describe, expect, it } from "vitest";

import {
  SALE_REQUEST_DEALER_DISCOUNT,
  SALE_REQUEST_RECOMMENDED_RATIO,
} from "../../src/modules/sale-requests/sale-requests.constants.js";
import {
  DEALER_DISCOUNT,
  RECOMMENDED_RATIO,
  isAboveRecommended,
  recommendedMaxPrice,
} from "../../frontend/lib/sale-requests/pricing.ts";

/**
 * Guarda de sincronia do desconto RECOMENDADO entre backend e frontend.
 *
 * O número vive nos dois lados por motivos diferentes: a TELA o usa para
 * orientar (faixa recomendada, aviso comercial) e o BACKEND o mantém para
 * documentar a regra que deliberadamente NÃO aplica — os 15% são recomendação,
 * e recusar publicação por causa deles trocaria conselho por proibição.
 *
 * Divergir seria pior do que parece: a tela diria "recomendamos até R$ 63.750"
 * e um relatório, um e-mail futuro ou uma regra de produto escrita a partir da
 * constante do servidor falariam de outro número — sem que nada quebrasse.
 *
 * É o mesmo desenho de `city-thresholds-sync`: dois processos, uma regra.
 */
describe("desconto recomendado — backend e frontend falam o mesmo número", () => {
  it("o desconto é 15% dos dois lados", () => {
    expect(DEALER_DISCOUNT).toBe(SALE_REQUEST_DEALER_DISCOUNT);
    expect(DEALER_DISCOUNT).toBe(0.15);
  });

  it("o teto derivado é 85% dos dois lados", () => {
    expect(RECOMMENDED_RATIO).toBe(SALE_REQUEST_RECOMMENDED_RATIO);
    expect(RECOMMENDED_RATIO).toBe(0.85);
  });

  it("a faixa recomendada sai do MESMO cálculo em qualquer FIPE", () => {
    for (const fipe of [10_000, 37_900, 75_000, 137_192.34, 980_000]) {
      const doFrontend = recommendedMaxPrice(fipe);
      const doBackend = Math.round(fipe * SALE_REQUEST_RECOMMENDED_RATIO * 100) / 100;
      expect(doFrontend).toBe(doBackend);
    }
  });

  it("sem FIPE não existe faixa — e não existe 'acima da faixa'", () => {
    // O caminho do provedor fora do ar. Devolver 0 faria a tela mostrar
    // "Até R$ 0,00" como se fosse orientação; devolver a própria FIPE
    // inverteria o conselho.
    expect(recommendedMaxPrice(null)).toBeNull();
    expect(recommendedMaxPrice(0)).toBeNull();
    expect(isAboveRecommended(90_000, null)).toBe(false);
  });

  it("a fronteira é exata: 85% está DENTRO da faixa, um centavo acima está fora", () => {
    expect(isAboveRecommended(63_750, 75_000)).toBe(false);
    expect(isAboveRecommended(63_750.01, 75_000)).toBe(true);
  });
});
