import { vi } from "vitest";

import "@testing-library/jest-dom/vitest";

/**
 * Polyfills do jsdom — APIs que todo navegador tem e o jsdom não implementa.
 *
 * ── Por que aqui, e não com uma guarda no componente ────────────────────────
 * `scrollIntoView` existe em todo navegador desde sempre; o jsdom simplesmente
 * não a implementa (jsdom/jsdom#1695, aberto desde 2016). Sem este stub, um
 * componente que rola até o campo com erro — comportamento correto de produto —
 * derruba o teste com `TypeError: target.scrollIntoView is not a function`, e a
 * suíte fecha com erros não tratados que não descrevem defeito nenhum.
 *
 * A alternativa seria proteger cada chamada em produção com
 * `typeof el.scrollIntoView === "function"`. Isso é código morto no navegador,
 * escrito só para agradar o ambiente de teste — e espalha a dívida por todo
 * componente que precise rolar a tela. O lugar certo de compensar uma lacuna do
 * jsdom é o setup do jsdom.
 *
 * ── Por que `vi.fn()` e não `() => {}` ──────────────────────────────────────
 * `vi.fn()` mantém o stub inspecionável: um teste que precise provar "a tela
 * rolou até o primeiro campo pendente" pode afirmar sobre as chamadas, e pode
 * limpá-las com `vi.mocked(Element.prototype.scrollIntoView).mockClear()`.
 * Um no-op anônimo fecharia essa porta.
 *
 * ── O que este stub NÃO faz ────────────────────────────────────────────────
 * Não engole erro de aplicação: `scrollIntoView` devolve `void` no navegador
 * real, então um stub que não faz nada tem exatamente a mesma superfície
 * observável. Qualquer exceção lançada ANTES ou DEPOIS da chamada continua
 * subindo.
 *
 * `defineProperty` só é aplicado quando a API está mesmo ausente: se um dia o
 * jsdom passar a implementá-la, o comportamento real prevalece.
 */
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
}
