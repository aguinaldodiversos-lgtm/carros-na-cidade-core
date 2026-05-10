/**
 * Validators puros do smoke da Página Regional.
 *
 * Separados do orchestrator (`scripts/smoke-regional-page.mjs`) para que
 * cada função possa ser testada com vitest sem precisar subir um servidor
 * HTTP. Cada export recebe entradas já parseadas (HTML como string,
 * URL como string) e retorna `{ ok: boolean, message: string }` —
 * formato propositalmente simples para o reporter do orchestrator.
 *
 * Princípios:
 *  - Nenhum side-effect, nenhuma chamada de rede. Funções puras.
 *  - Heurísticas explícitas em vez de DOM completo (jsdom seria 30 MB
 *    de dependência para parsear cinco regex). Comprometimento aceito:
 *    se o template do HTML mudar muito, alguns checks podem virar
 *    falso-positivo — manter as heurísticas pequenas e legíveis facilita
 *    o ajuste.
 *  - Mensagens em PT-BR; exit message inclui contexto suficiente para
 *    diagnóstico sem precisar abrir o HTML cru.
 */

/**
 * Lista de hostnames considerados seguros para rodar o smoke.
 *
 * O smoke faz GET na página renderizada — sem side-effects óbvios. Mesmo
 * assim, rodar contra produção sem perceber pode (a) inflar métricas, (b)
 * confundir Search Console se a flag for ligada acidentalmente, (c)
 * disparar rate-limit em produção. Bloqueio por default; escape via
 * ALLOW_PRODUCTION=true (não documentado fora do código).
 */
export function isAllowedSmokeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost") return true;
  if (host === "127.0.0.1") return true;
  if (host === "0.0.0.0") return true;
  if (host.endsWith(".localhost")) return true;
  // Convenções comuns de staging em PaaS (Render/Vercel/Netlify): incluem
  // "staging" no hostname. Aceitamos somente quando o segmento aparece
  // como prefixo, infixo ou sufixo isolado por hifens/pontos para evitar
  // que "carros-na-cidade-staging-xyz.onrender.com" passe junto com
  // "carrosdestaging.com" (improvável mas defensivo).
  if (/(^|[.-])staging([.-]|$)/.test(host)) return true;
  if (/(^|[.-])preview([.-]|$)/.test(host)) return true;
  if (/(^|[.-])review([.-]|$)/.test(host)) return true;
  return false;
}

/**
 * Status code check. `expected` aceita number ou array de numbers.
 */
export function checkStatus(actualStatus, expected) {
  const expectedArr = Array.isArray(expected) ? expected : [expected];
  if (expectedArr.includes(actualStatus)) {
    return { ok: true, message: `status ${actualStatus} OK` };
  }
  return {
    ok: false,
    message: `status ${actualStatus} (esperado ${expectedArr.join(" ou ")})`,
  };
}

/**
 * Lê o conteúdo do <meta name="robots"> e valida que tem `noindex` E
 * `follow`. Aceita variações de espaço/vírgula.
 *
 * Retorna ok=false quando:
 *  - meta robots ausente (Next pode omitir; nesse caso a página é
 *    indexável por default e o smoke deve gritar).
 *  - contém `index` (sem `noindex`).
 *  - contém `nofollow` (deve ser `follow` na Fase A→B).
 */
export function checkRobots(html) {
  const match = html.match(
    /<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i
  );
  if (!match) {
    return {
      ok: false,
      message: "<meta name='robots'> ausente — página seria indexável por default",
    };
  }
  const content = match[1].toLowerCase().replace(/\s+/g, "");
  const tokens = new Set(content.split(",").filter(Boolean));
  const hasNoindex = tokens.has("noindex");
  const hasFollow = tokens.has("follow");
  if (!hasNoindex) {
    return {
      ok: false,
      message: `robots="${match[1]}" — falta 'noindex' (Fase A→B exige noindex)`,
    };
  }
  if (!hasFollow) {
    return {
      ok: false,
      message: `robots="${match[1]}" — falta 'follow' (Fase A→B exige noindex,follow)`,
    };
  }
  return { ok: true, message: `robots="${match[1]}"` };
}

/**
 * Lê <link rel="canonical"> e valida que aponta para a cidade-base
 * (`/carros-em/${baseSlug}`). Self-canonical (apontando para a própria
 * regional) é REJEITADO nesta fase — runbook §5 Fase A/B/C.
 */
export function checkCanonical(html, baseSlug) {
  const match = html.match(
    /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i
  );
  if (!match) {
    return { ok: false, message: "<link rel='canonical'> ausente" };
  }
  const href = match[1];
  let pathname;
  try {
    pathname = new URL(href).pathname;
  } catch {
    pathname = href;
  }
  const expectedPath = `/carros-em/${encodeURIComponent(baseSlug)}`;
  // Aceita tanto o slug bruto quanto o encoded — slug normal não tem
  // caracteres que mudem com encodeURIComponent.
  if (pathname === expectedPath || pathname === `/carros-em/${baseSlug}`) {
    return { ok: true, message: `canonical → ${pathname}` };
  }
  if (pathname.startsWith(`/carros-usados/regiao/${baseSlug}`)) {
    return {
      ok: false,
      message: `canonical self-referente (${pathname}) — Fase A→B exige canonical → /carros-em/${baseSlug}`,
    };
  }
  return {
    ok: false,
    message: `canonical → ${pathname}, esperado ${expectedPath}`,
  };
}

/**
 * Heurísticas para conteúdo essencial:
 *  - "região de" + nome da cidade aparece em algum lugar (h1 ou descr).
 *  - Indicação de raio em km presente.
 *  - NÃO contém placeholders falsos óbvios ("R$ 0", "lorem ipsum").
 *  - Contém pelo menos uma chip/link da cidade-base ou cidades próximas
 *    (ou o fallback profissional quando não há membros).
 *
 * `cityNameHints` aceita uma lista de strings (case-insensitive) — ao
 * menos uma deve aparecer no HTML. Útil porque o nome é
 * server-rendered a partir do payload do backend; o smoke não sabe
 * a priori o nome canônico (ex.: "Atibaia" vs "atibaia").
 */
export function checkContent(html, { baseSlug, cityNameHints }) {
  const lower = html.toLowerCase();

  // 1. Título regional — palavra-chave robusta.
  if (!/regi[aã]o de/i.test(html)) {
    return {
      ok: false,
      message: 'h1/título não contém "região de"',
    };
  }

  // 2. Algum hint do nome da cidade aparece (mínimo viável: o slug bruto
  //    aparece em algum href; se houver hints específicos, casa contra
  //    eles).
  const hints = Array.isArray(cityNameHints) && cityNameHints.length > 0
    ? cityNameHints
    : [baseSlug.split("-").slice(0, -1).join(" ").toLowerCase()];
  const cityVisible = hints.some((hint) =>
    typeof hint === "string" && hint.length > 0 && lower.includes(hint.toLowerCase())
  );
  if (!cityVisible) {
    return {
      ok: false,
      message: `nome da cidade não aparece (procurado: ${hints.join(", ")})`,
    };
  }

  // 3. Indicação de raio em km.
  if (!/\d+\s*km/i.test(html)) {
    return {
      ok: false,
      message: "indicação de raio (ex: '80 km') não encontrada",
    };
  }

  // 4. Placeholders falsos.
  if (/\bR\$\s*0(?:[,.]00)?\b/.test(html)) {
    return {
      ok: false,
      message: "placeholder falso 'R$ 0' detectado no HTML",
    };
  }
  if (/lorem\s+ipsum/i.test(html)) {
    return {
      ok: false,
      message: "placeholder 'lorem ipsum' detectado no HTML",
    };
  }

  return { ok: true, message: "conteúdo essencial presente" };
}

/**
 * Detecta se a página renderizou anúncios reais OU o fallback
 * profissional. Não pode haver os dois ausentes — seria página vazia.
 *
 * Heurística:
 *  - Fallback profissional: substring "Ainda não encontramos veículos
 *    nesta região" (texto literal do region-page-view.tsx).
 *  - Anúncios renderizados: mais de uma ocorrência de classes/atributos
 *    do AdCard ou AdGrid. Não tentamos contar com precisão; apenas
 *    distinguir "tem cards" de "tem fallback".
 */
export function checkAdsOrFallback(html) {
  const hasFallback = html.includes(
    "Ainda não encontramos veículos nesta região"
  );

  // AdCard renderiza um Link com /veiculo/ ou data-ad-id. Heurística
  // duplamente segura: se o HTML tiver pelo menos 1 href para /veiculo/
  // OU pelo menos 1 elemento com data-ad-id, consideramos "há anúncios".
  const adLinks = (html.match(/href=["']\/veiculo\/[^"']+["']/gi) || []).length;
  const adIds = (html.match(/data-ad-id=["'][^"']+["']/gi) || []).length;
  const hasAds = adLinks > 0 || adIds > 0;

  if (hasFallback && !hasAds) {
    return {
      ok: true,
      message: "fallback profissional presente (sem anúncios na região)",
      kind: "fallback",
      adCount: 0,
    };
  }
  if (hasAds) {
    return {
      ok: true,
      message: `anúncios renderizados (${adLinks || adIds} cards detectados)`,
      kind: "ads",
      adCount: adLinks || adIds,
    };
  }
  return {
    ok: false,
    message:
      "nem anúncios nem fallback detectados — página parece vazia/quebrada",
    kind: "empty",
    adCount: 0,
  };
}

/**
 * Detecta presença de chips de cidades da região. Tolerante: se a
 * cidade-base está sozinha (sem membros), os chips podem estar ausentes
 * (a UI esconde a seção quando memberCount=0). O check só FALHA quando
 * há indício de que deveria haver chips e não há.
 *
 * Critério atual: se o HTML menciona "Cidades nesta região" (label do
 * componente region-page-view), espera-se ao menos um link adicional
 * para `/carros-em/...` que NÃO seja a cidade-base.
 */
export function checkRegionChips(html, baseSlug) {
  const hasLabel = html.includes("Cidades nesta região");
  if (!hasLabel) {
    return {
      ok: true,
      message: "região sem cidades vizinhas (cidade-base isolada) — chips suprimidos como esperado",
      memberLinks: 0,
    };
  }
  // Conta links /carros-em/[slug] que NÃO sejam a base.
  const linkRegex = /href=["']\/carros-em\/([^"'\/]+)["']/gi;
  const slugs = new Set();
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    if (m[1] !== baseSlug) slugs.add(m[1]);
  }
  if (slugs.size === 0) {
    return {
      ok: false,
      message:
        "label 'Cidades nesta região' presente mas nenhuma chip de cidade vizinha encontrada",
      memberLinks: 0,
    };
  }
  return {
    ok: true,
    message: `${slugs.size} cidade(s) vizinha(s) renderizada(s) como chip`,
    memberLinks: slugs.size,
  };
}
