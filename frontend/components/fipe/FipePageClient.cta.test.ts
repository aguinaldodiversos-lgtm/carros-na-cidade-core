import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Defesa contra regressão de CTAs duplicados em /tabela-fipe/[cidade].
 *
 * Histórico: a página tinha um banner "Anuncie grátis no portal" no
 * meio da página, com PNG + heading + botão "Criar anúncio grátis".
 * Combinado com o "Anunciar" do Header desktop e o FAB "+" do
 * SiteBottomNav mobile, o usuário via 3 CTAs comerciais simultâneos
 * em uma página de CONSULTA — produzia ansiedade comercial e
 * desviava do foco na cotação FIPE.
 *
 * A rodada de simplificação removeu o `AnunciarFreeBanner` da página.
 * Conta de CTAs in-page para `/anunciar/novo`:
 *   - Antes: 1 (banner com PNG + botão)
 *   - Agora: 0 (in-page); CTA permanece global no Header e no FAB
 *
 * Este teste impede que o banner volte sem revisão de UX.
 */

describe("FipePageClient — sem CTA in-page para /anunciar/novo", () => {
  const filePath = join(
    process.cwd(),
    "components",
    "fipe",
    "FipePageClient.tsx"
  );
  const source = readFileSync(filePath, "utf8");

  it("NÃO renderiza nenhum href para /anunciar/novo na página FIPE", () => {
    // /anunciar/novo é o único destino in-page proibido aqui. CTAs
    // globais (Header/FAB) são responsabilidade dos componentes de
    // shell e não tocam este arquivo.
    expect(source).not.toMatch(/href=["']\/anunciar\/novo/);
  });

  it('NÃO contém o componente "AnunciarFreeBanner" definido', () => {
    // Função foi removida; sentinela de existência da definição.
    expect(source).not.toMatch(/function AnunciarFreeBanner/);
    expect(source).not.toMatch(/<AnunciarFreeBanner\b/);
  });

  it('NÃO contém o texto comercial "Criar anúncio grátis"', () => {
    expect(source).not.toMatch(/Criar an[úu]ncio gr[áa]tis/i);
  });

  it('mantém o CTA secundário "Ver carros abaixo da FIPE" (intenção de COMPRA)', () => {
    // Esse CTA permanece — direcionar consulta FIPE para descoberta
    // de oportunidades é parte do fluxo informacional → transacional
    // legítimo, e não duplica o CTA de criação de anúncio.
    expect(source).toMatch(/Ver carros abaixo da FIPE em/);
  });
});
