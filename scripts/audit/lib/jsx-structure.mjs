/**
 * ANÁLISE ESTRUTURAL DE JSX PARA O PROJECT AUDIT.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O DEFEITO QUE ESTE MÓDULO EXISTE PARA CORRIGIR
 * ════════════════════════════════════════════════════════════════════════════
 * As regras `direct-nested-link`, `wrapped-self-linking-component` e
 * `jsx-in-ts` liam o arquivo como TEXTO CRU. Um `<Link>` escrito dentro de um
 * comentário de documentação contava como abertura de tag.
 *
 * Foi o que aconteceu com os oito erros do audit em 2026-09-04. Todos falsos
 * positivos, todos da mesma causa. Exemplo real, `CatalogPagination.tsx`:
 *
 *     // linha 20, dentro do bloco de documentação:
 *     //   "O clique continua sendo interceptado pelo `<Link>` do Next"
 *
 * O scanner tomava esse `<Link>` como tag aberta, seguia procurando e achava o
 * primeiro `<Link` REAL (linha 132) antes do primeiro `</Link>` (linha 143) —
 * profundidade 2, "link aninhado". O componente estava certo: três `<Link>`
 * IRMÃOS, cada um aberto e fechado.
 *
 * A ironia é que o projeto documenta muito bem os componentes, e era justamente
 * a documentação que disparava o alarme. O detector punia a boa prática.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE NÃO USAR UM PARSER DE VERDADE
 * ════════════════════════════════════════════════════════════════════════════
 * Seria a solução ideal, e foi descartada por uma razão concreta: o job
 * `frontend` do CI roda `npm ci` SÓ em `frontend/`, e depois executa
 * `npm run audit:project` a partir da raiz. O `node_modules` da raiz não existe
 * ali. `project-audit.mjs` importa apenas `node:fs` e `node:path` — é por isso
 * que ele funciona. Importar `typescript` ou `@babel/parser` derrubaria o audit
 * com MODULE_NOT_FOUND no próprio CI que se quer consertar.
 *
 * A alternativa — importar de `frontend/node_modules` — faria o audit se
 * comportar de um jeito quando as dependências do frontend estão instaladas e
 * de outro quando não estão. Comportamento condicional é o oposto de CI
 * confiável.
 *
 * Então: zero dependência, mas com um scanner que de fato entende as três
 * coisas que o anterior ignorava — comentários, literais de texto e tags
 * auto-fechadas.
 */

/**
 * Substitui comentários, strings e template literals por espaços, preservando
 * comprimento e quebras de linha (offsets e números de linha continuam válidos).
 *
 * É o passo que faltava: depois dele, um `<Link>` só existe no resultado se
 * estiver em posição de código.
 */
export function stripNonCode(source) {
  const src = String(source ?? "");
  const out = new Array(src.length);

  // Preserva a quebra de linha para não colapsar a contagem de linhas.
  const blank = (i) => (src[i] === "\n" ? "\n" : " ");

  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];

    // ── comentário de linha
    if (c === "/" && d === "/") {
      while (i < src.length && src[i] !== "\n") (out[i] = blank(i)), i++;
      continue;
    }

    // ── comentário de bloco (cobre JSDoc)
    if (c === "/" && d === "*") {
      const fim = src.indexOf("*/", i + 2);
      const ate = fim === -1 ? src.length : fim + 2;
      while (i < ate) (out[i] = blank(i)), i++;
      continue;
    }

    // ── string simples/dupla
    if (c === '"' || c === "'") {
      const aspas = c;
      out[i] = " ";
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          out[i] = blank(i);
          if (i + 1 < src.length) out[i + 1] = blank(i + 1);
          i += 2;
          continue;
        }
        if (src[i] === aspas) {
          out[i] = " ";
          i++;
          break;
        }
        // String não fecha na mesma linha: sai para não engolir o arquivo.
        if (src[i] === "\n") break;
        out[i] = blank(i);
        i++;
      }
      continue;
    }

    // ── template literal (pode conter `${...}` com código; o conteúdo textual
    //    vira branco e as expressões também — nenhuma delas abre tag JSX que a
    //    contagem de aninhamento precise ver).
    if (c === "`") {
      out[i] = " ";
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          out[i] = blank(i);
          if (i + 1 < src.length) out[i + 1] = blank(i + 1);
          i += 2;
          continue;
        }
        if (src[i] === "`") {
          out[i] = " ";
          i++;
          break;
        }
        out[i] = blank(i);
        i++;
      }
      continue;
    }

    out[i] = c;
    i++;
  }

  return out.join("");
}

/** `<Nome` só é abertura de tag se o caractere seguinte não continuar o nome. */
function ehInicioDeTag(src, idx, nome) {
  const depois = src[idx + 1 + nome.length];
  return depois === undefined || /[\s/>]/.test(depois);
}

/**
 * Fim da tag de abertura iniciada em `start`.
 *
 * Procura o `>` que fecha a tag ignorando os que estão dentro de `{...}` — é o
 * que faz `onClick={(e) => ...}` não ser confundido com o fim da tag. Devolve
 * também se a tag é auto-fechada (`/>`), que o scanner antigo não distinguia:
 * um `<Link ... />` sem `</Link>` fazia a varredura seguir para o irmão
 * seguinte e contar profundidade a mais.
 */
function fimDaTagDeAbertura(src, start) {
  let chaves = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") chaves++;
    else if (c === "}") chaves--;
    else if (c === ">" && chaves === 0) {
      let k = i - 1;
      while (k > start && /\s/.test(src[k])) k--;
      return { fim: i, autoFechada: src[k] === "/" };
    }
  }
  return null;
}

/**
 * Eventos de tag (abertura/fechamento/auto-fechada) de `tagName`, em ordem de
 * documento, já sobre o código sem comentários e sem literais.
 */
function eventosDeTag(codigo, tagName) {
  const abre = `<${tagName}`;
  const fecha = `</${tagName}`;
  const eventos = [];

  let i = 0;
  while (i < codigo.length) {
    const a = codigo.indexOf(abre, i);
    const f = codigo.indexOf(fecha, i);

    if (a === -1 && f === -1) break;

    if (a !== -1 && (f === -1 || a < f)) {
      if (!ehInicioDeTag(codigo, a, tagName)) {
        i = a + 1;
        continue;
      }
      const fimTag = fimDaTagDeAbertura(codigo, a);
      if (!fimTag) break;
      eventos.push({ tipo: fimTag.autoFechada ? "auto" : "abre", pos: a, fim: fimTag.fim });
      i = fimTag.fim + 1;
      continue;
    }

    // `</Tag` — confirma que fecha mesmo esta tag (e não `</Tagzinha>`).
    const depois = codigo[f + fecha.length];
    if (depois !== undefined && !/[\s>]/.test(depois)) {
      i = f + 1;
      continue;
    }
    eventos.push({ tipo: "fecha", pos: f });
    i = f + fecha.length;
  }

  return eventos;
}

/**
 * `true` quando existe `<tagName>` renderizada DENTRO de outra `<tagName>`.
 *
 * Irmãos não contam. Ramos de ternário não contam (são irmãos no texto e
 * exclusivos em runtime — o audit não tem como decidir isso, e o custo de um
 * falso positivo aqui é maior que o de um falso negativo raro).
 */
export function hasNestedTag(source, tagName = "Link") {
  const codigo = stripNonCode(source);
  let profundidade = 0;

  for (const ev of eventosDeTag(codigo, tagName)) {
    if (ev.tipo === "auto") {
      if (profundidade > 0) return true;
      continue;
    }
    if (ev.tipo === "abre") {
      profundidade++;
      if (profundidade > 1) return true;
      continue;
    }
    if (profundidade > 0) profundidade--;
  }

  return false;
}

/**
 * `true` quando `<componentName` aparece dentro de um `<Link>` aberto.
 *
 * Antes bastava o componente e um `<Link>` coexistirem no arquivo, porque a
 * varredura abria escopo num `<Link>` de comentário e nunca o fechava. Agora o
 * componente precisa estar mesmo entre a abertura e o fechamento.
 */
export function tagWrapsComponent(source, componentName, tagName = "Link") {
  if (!componentName) return false;
  const codigo = stripNonCode(source);
  const eventos = eventosDeTag(codigo, tagName);
  if (eventos.length === 0) return false;

  // Intervalos [inicioDoConteudo, posicaoDoFechamento) de cada `<Link>` aberto.
  const pilha = [];
  const intervalos = [];
  for (const ev of eventos) {
    if (ev.tipo === "abre") pilha.push(ev.fim + 1);
    else if (ev.tipo === "fecha") {
      const inicio = pilha.pop();
      if (inicio !== undefined) intervalos.push([inicio, ev.pos]);
    }
  }
  if (intervalos.length === 0) return false;

  const alvo = `<${componentName}`;
  let i = 0;
  while (i < codigo.length) {
    const idx = codigo.indexOf(alvo, i);
    if (idx === -1) return false;
    if (ehInicioDeTag(codigo, idx, componentName)) {
      for (const [de, ate] of intervalos) {
        if (idx > de && idx < ate) return true;
      }
    }
    i = idx + 1;
  }

  return false;
}

/**
 * Sinais de JSX num arquivo `.ts`.
 *
 * Mesmos sinais de antes (`return (<`, `<svg`, `<div`, `<Link`) — a regra não
 * ficou mais permissiva nem mais ampla. O que mudou é que agora eles são
 * procurados no CÓDIGO, não no texto do arquivo: uma menção a `<Link>` numa
 * linha de documentação deixou de valer como JSX.
 *
 * `return\s*\(\s*<` passou a exigir uma letra depois do `<`, para não casar com
 * comparação (`return (a < b)`).
 */
export function looksLikeJsx(source) {
  const codigo = stripNonCode(source);
  return (
    /return\s*\(\s*<[A-Za-z]/m.test(codigo) ||
    /<svg\b/m.test(codigo) ||
    /<div\b/m.test(codigo) ||
    /<Link\b/m.test(codigo)
  );
}
