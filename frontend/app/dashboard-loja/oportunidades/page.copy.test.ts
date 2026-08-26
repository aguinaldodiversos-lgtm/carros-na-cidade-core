import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A copy do hub de oportunidades — travada por leitura estática do source.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE LER O ARQUIVO, E NÃO RENDERIZAR
 * ════════════════════════════════════════════════════════════════════════════
 * `page.tsx` é um Server Component `async` com guarda de sessão: montá-lo em
 * jsdom exigiria mockar a sessão inteira para verificar três frases. O projeto
 * já resolve isso assim em `app/seguranca/page.copy.test.ts`, e é o mesmo
 * problema.
 *
 * O render de verdade é coberto no navegador, em
 * `e2e/dealer-opportunities-hub.spec.ts`. Este arquivo é a rede rápida: falha em
 * milissegundos, no lugar certo, quando alguém reescreve a frase.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A PROMESSA TERRITORIAL PRECISA CABER NA QUERY
 * ════════════════════════════════════════════════════════════════════════════
 * `listActiveByCity` filtra por `pi.city_id = <cidade da loja>`. Igualdade —
 * sem raio, sem `region_memberships`, sem vizinhança. "Sua região" prometia
 * abrangência que a consulta não entrega, e o lojista de Atibaia concluiria que
 * não há compradores ao não ver os de Bragança.
 */

describe("hub de oportunidades — copy fiel ao escopo real", () => {
  const filePath = join(process.cwd(), "app", "dashboard-loja", "oportunidades", "page.tsx");
  const source = readFileSync(filePath, "utf8");

  /** Só o que a tela EXIBE — comentários explicam decisões e citam os termos. */
  const rendered = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("§10 — a promessa é a CIDADE, que é o escopo da consulta", () => {
    expect(rendered).toContain("Receba demandas reais da sua cidade");
  });

  it("§10/§11 — nenhuma promessa regional sobrou no texto exibido", () => {
    /*
      A varredura é sobre o texto SEM comentários, de propósito: o comentário
      logo acima da lista explica por que "região" saiu, e cita a palavra. Uma
      varredura crua acusaria a própria explicação — o mesmo defeito que já
      mordeu a Fase 4.11A, quando um termo solto colidiu com um cartão legítimo.
    */
    expect(rendered).not.toMatch(/sua região|da região|regional/i);
  });

  it("os dois caminhos continuam nomeados como o produto os chama", () => {
    expect(rendered).toContain("Compradores ativos");
    expect(rendered).toContain("Veículos para avaliação");
  });

  it("os seis passos de 'Como funciona' descrevem telas que existem", () => {
    for (const step of [
      "Ver intenção de compra",
      "Ofertar veículo do estoque",
      "Aguardar resposta",
      "Analisar veículo",
      "Enviar oferta",
      "Negociar compra",
    ]) {
      expect(rendered, step).toContain(step);
    }

    // Nada de etapa que a plataforma não executa — contrato digital, pagamento
    // pela plataforma, vistoria. Vender isso aqui cria a cobrança depois.
    expect(rendered).not.toMatch(/contrato digital|pagamento pela plataforma|vistoria/i);
  });
});
