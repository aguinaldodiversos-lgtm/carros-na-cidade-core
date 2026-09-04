import { describe, expect, it } from "vitest";

import {
  hasNestedTag,
  looksLikeJsx,
  stripNonCode,
  tagWrapsComponent,
} from "../../scripts/audit/lib/jsx-structure.mjs";

/**
 * O DETECTOR DE JSX DO PROJECT AUDIT.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTES TESTES EXISTEM PARA IMPEDIR
 * ════════════════════════════════════════════════════════════════════════════
 * Em 2026-09-04 o `audit:project` reprovava o CI com OITO erros. Todos falsos
 * positivos, todos da mesma causa: o scanner lia o arquivo como texto cru e
 * contava um `<Link>` escrito dentro de um comentário como tag aberta.
 *
 * O primeiro grupo de casos abaixo é o que corrige isso. O segundo grupo é o
 * que impede a "correção" de virar permissividade: aninhamento REAL, wrapper
 * REAL e JSX REAL continuam sendo reportados. Sem esse segundo grupo, apagar as
 * regras passaria nos testes.
 */

describe("stripNonCode — o passo que faltava", () => {
  it("apaga comentário de linha", () => {
    const codigo = stripNonCode(`// <Link href="/a">x</Link>\nconst a = 1;`);
    expect(codigo).not.toContain("<Link");
    expect(codigo).toContain("const a = 1;");
  });

  it("apaga comentário de bloco, inclusive JSDoc", () => {
    const codigo = stripNonCode(`/**\n * Interceptado pelo \`<Link>\` do Next.\n */\nconst a = 1;`);
    expect(codigo).not.toContain("<Link");
  });

  it("apaga string e template literal", () => {
    const codigo = stripNonCode('const s = "<Link href=\\"/a\\">";\nconst t = `<div>`;');
    expect(codigo).not.toContain("<Link");
    expect(codigo).not.toContain("<div");
  });

  it("preserva comprimento e número de linhas", () => {
    const fonte = `// um\n/* dois */\nconst a = 1;\n`;
    const codigo = stripNonCode(fonte);
    expect(codigo).toHaveLength(fonte.length);
    expect(codigo.split("\n")).toHaveLength(fonte.split("\n").length);
  });

  it("não engole o arquivo quando uma aspa não fecha na linha", () => {
    // Aspa solta (apóstrofo em comentário mal formado, por exemplo) não pode
    // apagar todo o resto do arquivo.
    const codigo = stripNonCode(`const a = 'nao fecha\nconst b = 2;`);
    expect(codigo).toContain("const b = 2;");
  });
});

describe("hasNestedTag — aninhamento real, não coexistência textual", () => {
  it("CASO A — dois Links IRMÃOS não são aninhados", () => {
    const fonte = `
      <div>
        <Link href="/a">A</Link>
        <Link href="/b">B</Link>
      </div>`;
    expect(hasNestedTag(fonte, "Link")).toBe(false);
  });

  it("CASO B — Link dentro de Link É aninhado", () => {
    const fonte = `
      <Link href="/a">
        <Link href="/b">B</Link>
      </Link>`;
    expect(hasNestedTag(fonte, "Link")).toBe(true);
  });

  it("CASO C — ramos separados de ternário não são aninhados", () => {
    const fonte = `
      {condition ? <Link href="/a">A</Link> : <Link href="/b">B</Link>}`;
    expect(hasNestedTag(fonte, "Link")).toBe(false);
  });

  it("o Link do COMENTÁRIO não abre escopo (a regressão dos 8 erros)", () => {
    // Reprodução fiel do que havia em CatalogPagination.tsx e nos outros quatro.
    const fonte = `
      /**
       * O clique continua sendo interceptado pelo \`<Link>\` do Next.
       */
      export function Paginacao() {
        return (
          <nav>
            <Link href="/a">A</Link>
            <Link href="/b">B</Link>
          </nav>
        );
      }`;
    expect(hasNestedTag(fonte, "Link")).toBe(false);
  });

  it("tag auto-fechada não abre escopo", () => {
    // O scanner antigo tratava `<Link />` como abertura e seguia até o irmão
    // seguinte, contando profundidade 2.
    const fonte = `
      <div>
        <Link href="/a" />
        <Link href="/b">B</Link>
      </div>`;
    expect(hasNestedTag(fonte, "Link")).toBe(false);
  });

  it("auto-fechada DENTRO de outra é aninhamento", () => {
    const fonte = `<Link href="/a"><Link href="/b" /></Link>`;
    expect(hasNestedTag(fonte, "Link")).toBe(true);
  });

  it("`=>` nos atributos não confunde o fim da tag de abertura", () => {
    const fonte = `
      <div>
        <Link
          href="/a"
          onClick={(event) => {
            event.preventDefault();
          }}
        >
          A
        </Link>
        <Link href="/b">B</Link>
      </div>`;
    expect(hasNestedTag(fonte, "Link")).toBe(false);
  });

  it("não confunde um componente de nome parecido", () => {
    // `<LinkButton>` não é `<Link>`.
    const fonte = `<LinkButton href="/a"><Link href="/b">B</Link></LinkButton>`;
    expect(hasNestedTag(fonte, "Link")).toBe(false);
  });
});

describe("tagWrapsComponent — pai/filho real", () => {
  it("CASO D — Link e componente independentes NÃO são wrapper", () => {
    const fonte = `
      <div className="flex items-center gap-2">
        <AccountUserMenu userName={userName} />
        <Link href="/anunciar/novo">Anunciar</Link>
      </div>`;
    expect(tagWrapsComponent(fonte, "AccountUserMenu")).toBe(false);
  });

  it("CASO E — componente DENTRO do Link é wrapper", () => {
    const fonte = `
      <Link href="/foo">
        <AccountPlanCard variant="pf" />
      </Link>`;
    expect(tagWrapsComponent(fonte, "AccountPlanCard")).toBe(true);
  });

  it("componente DEPOIS do fechamento do Link não é wrapper", () => {
    const fonte = `
      <Link href="/foo">texto</Link>
      <AccountPlanCard variant="pf" />`;
    expect(tagWrapsComponent(fonte, "AccountPlanCard")).toBe(false);
  });

  it("Link só mencionado em comentário não embrulha nada", () => {
    const fonte = `
      /* O AccountPlanCard tem navegação própria; não use <Link> em volta. */
      <div>
        <AccountPlanCard variant="pf" />
      </div>`;
    expect(tagWrapsComponent(fonte, "AccountPlanCard")).toBe(false);
  });

  it("nome de componente vazio não reporta", () => {
    expect(tagWrapsComponent(`<Link href="/a">x</Link>`, "")).toBe(false);
  });
});

describe("looksLikeJsx — JSX real num arquivo .ts", () => {
  it("generics do TypeScript NÃO são JSX", () => {
    const fonte = `function identity<T>(value: T): T {\n  return value;\n}`;
    expect(looksLikeJsx(fonte)).toBe(false);
  });

  it("chamada com type argument NÃO é JSX", () => {
    expect(looksLikeJsx(`const value = foo<Bar>();`)).toBe(false);
  });

  it("comparação com < não é JSX", () => {
    expect(looksLikeJsx(`function menor(a: number, b: number) {\n  return (a < b);\n}`)).toBe(
      false
    );
  });

  it("menção a <Link> em comentário NÃO é JSX (a regressão de vehicle-breadcrumbs)", () => {
    const fonte = `
      /**
       * Alimenta a trilha visual (com \`href\` como \`<Link>\`) e o
       * \`<BreadcrumbJsonLd>\`.
       */
      export function buildBreadcrumbs(): string[] {
        return [];
      }`;
    expect(looksLikeJsx(fonte)).toBe(false);
  });

  it("JSX de verdade É reportado", () => {
    expect(looksLikeJsx(`const x = <div>teste</div>;`)).toBe(true);
  });

  it("<svg> e <Link> em posição de código são reportados", () => {
    expect(looksLikeJsx(`export const icone = <svg viewBox="0 0 24 24" />;`)).toBe(true);
    expect(looksLikeJsx(`export const l = <Link href="/a">a</Link>;`)).toBe(true);
  });

  it("componente retornado entre parênteses é reportado", () => {
    expect(looksLikeJsx(`function C() {\n  return (\n    <Foo />\n  );\n}`)).toBe(true);
  });
});
