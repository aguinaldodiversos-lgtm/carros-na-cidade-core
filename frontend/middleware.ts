import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildBandwidthLogEntry,
  isBandwidthDiagnosticsEnabled,
} from "@/lib/middleware/bandwidth-log";
import { decideBotGuard } from "@/lib/middleware/bot-guard";
import { decideHostRedirect } from "@/lib/middleware/host-redirect";
import {
  decideRegionalMiddlewareAction,
  extractRegionalSlug,
  isFlagEnabled,
  validateRegionalSlug,
} from "@/lib/regional-page-guard";
import {
  decideAdAliasRedirect,
  decideAdDetailMiddlewareAction,
  extractAdDetailMatch,
  validateAdIdentifier,
} from "@/lib/middleware/ad-detail-gate";
import {
  decideAnunciosListRedirect,
  decideComprarLegacyQueryRedirect,
  decideLegacyCityRedirect,
  decideQueryNormalizationRedirect,
} from "@/lib/middleware/canonical-redirects";
import {
  decideDealerMiddlewareAction,
  extractDealerSlug,
  validateDealerSlug,
} from "@/lib/middleware/dealer-gate";
import {
  decideBlogMiddlewareAction,
  extractBlogSlug,
  isCityHubSlug,
  validateBlogPostSlug,
} from "@/lib/middleware/blog-gate";
import { decideTerritoryGate } from "@/lib/middleware/territory-gate";
import {
  decideCityExistenceAction,
  decideUfExistenceAction,
  extractCityScopedMatch,
  extractUfScopedMatch,
  fetchPublicCitySet,
} from "@/lib/middleware/city-existence-gate";

/**
 * Middleware do frontend. Responsabilidades:
 *
 * 0. **Redirect 301 de hosts onrender.com → www.carrosnacidade.com**
 *    (contenção de bandwidth 2026-05-20). Bots/scrapers acessando
 *    `carros-na-cidade-portal.onrender.com` recebiam HTML completo —
 *    duplicando banda e fragmentando SEO. Exceção: pathname='/' e
 *    /healthcheck (Render usa raiz como probe). Ver
 *    `lib/middleware/host-redirect.ts`.
 *
 * 0b. **Bot guard: 429 para user-agent vazio em rotas SSR pesadas**
 *    (contenção de bandwidth 2026-05-20). Defesa de primeira linha
 *    contra scrapers elementares. Não afeta navegadores nem bots
 *    legítimos (Googlebot envia UA). Ver `lib/middleware/bot-guard.ts`.
 *
 * 1. **Hard gate da Página Regional canônica** (`/carros-usados/regiao/:slug`):
 *    - Sem `REGIONAL_PAGE_ENABLED="true"` → 404 HTTP real imediato.
 *    - Com flag on + slug inválido (cidade não existe) → 404 HTTP real.
 *    - Com flag on + slug válido → deixa passar, App Router renderiza.
 *
 *    A URL canônica é `/carros-usados/regiao/{citySlug}` onde `citySlug`
 *    é o slug canônico da cidade-base no formato `nome-uf` (regex
 *    `^[a-z0-9-]+-[a-z]{2}$`). Exemplos: `atibaia-sp`, `campinas-sp`,
 *    `belo-horizonte-mg`.
 *
 *    POR QUE NO MIDDLEWARE em vez de só no page.tsx?
 *    Next 14.2 pode retornar 200 com `NEXT_NOT_FOUND` quando `notFound()`
 *    é chamado depois do `<head>` ser flushed. Middleware garante 404
 *    HTTP real para slugs inválidos.
 *
 * 2. **Redirect 301 da rota legada** (`/:uf/regiao/:ancora`):
 *    Sempre redireciona para `/carros-usados/regiao/{ancora}-{uf}`.
 *
 * 2f. **Redirects 308 de canonicalização** (auditoria SEO 2026-08-06):
 *    - /comprar/cidade/[slug] → /carros-em/[slug]   (rota legada concorrente)
 *    - /anuncios/[identifier] → /veiculo/[slug]     (alias de anúncio)
 *    - /anuncios              → /comprar            (alias de listagem)
 *    - normalização de query nas vitrines (`sort=relevance`, `page=1`)
 *
 *    Todos AQUI e não em `page.tsx` pelo mesmo motivo dos 404 acima:
 *    `redirect()` em Server Component pode virar 200 + meta refresh, que o
 *    Googlebot não trata como redirect. Ver `lib/middleware/canonical-redirects.ts`.
 *
 * 3. **Redirects 301 de outras URLs legadas** (preservados):
 *    - /carros-{em,baratos-em,automaticos-em}-[slug] → versão com `/`
 *    - /painel/anuncios/novo → /anunciar/novo
 *    - /painel/anuncios/[id]/publicar → /upgrade
 *    - /anunciar/publicar → /anunciar  (tela intermediária removida)
 *
 * 4. **Injeção de `x-cnc-pathname`** para RootLayout resolver cidade ativa SSR.
 *
 * 5. **Logging temporário de bandwidth** condicionado a
 *    `BANDWIDTH_DIAGNOSTICS_ENABLED=true`. Emite 1 linha JSON por request
 *    em stdout (Render Logs). Sem PII. Ver `lib/middleware/bandwidth-log.ts`.
 */

const PATHNAME_HEADER = "x-cnc-pathname";

function withPathnameHeader(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return { request: { headers: requestHeaders } };
}

const LEGACY_ANCORA_RE = /^\/([a-z]{2})\/regiao\/([a-z0-9-]+)\/?$/;

function maybeLogBandwidth(request: NextRequest, response: NextResponse, startedAt: number): void {
  if (!isBandwidthDiagnosticsEnabled()) return;
  try {
    const entry = buildBandwidthLogEntry({
      method: request.method,
      pathname: request.nextUrl.pathname,
      status: response.status,
      contentType: response.headers.get("content-type"),
      host: request.headers.get("host"),
      referer: request.headers.get("referer"),
      userAgent: request.headers.get("user-agent"),
      cacheControl: response.headers.get("cache-control"),
      durationMs: Date.now() - startedAt,
    });
    // Stdout capturado pelo Render Logs. Nunca derrubar request por log.
    console.log(JSON.stringify(entry));
  } catch {
    // ignore — log nunca quebra request
  }
}

/** Envolve qualquer response com o logging de bandwidth condicional. */
function respond(request: NextRequest, startedAt: number, response: NextResponse): NextResponse {
  maybeLogBandwidth(request, response, startedAt);
  return response;
}

/**
 * 503 do gate — a resposta de "não consegui verificar".
 *
 * É a peça central da correção de 2026-08-07. Antes, indisponibilidade virava
 * `pass-unavailable` → 200: uma falha de infraestrutura (ou uma env ausente no
 * build) publicava página territorial que não deveria existir, sem erro
 * visível. 503 é temporário, carrega `Retry-After`, e o Google não o trata como
 * conteúdo — o crawler volta depois em vez de indexar o que não devíamos servir.
 *
 * `X-Robots-Tag: noindex` é cinto e suspensório: mesmo que algum intermediário
 * transforme o status, o corpo não entra no índice.
 */
function gateUnavailableResponse(scope: string, reason: string): NextResponse {
  const blocked = new NextResponse(null, { status: 503 });
  blocked.headers.set("Retry-After", "60");
  blocked.headers.set("Cache-Control", "no-store");
  blocked.headers.set("X-Robots-Tag", "noindex, nofollow");
  blocked.headers.set("X-Middleware-Gate-Unavailable", scope);
  blocked.headers.set("X-Middleware-Gate-Reason", reason);
  return blocked;
}

export async function middleware(request: NextRequest) {
  const startedAt = Date.now();
  const { pathname, search } = request.nextUrl;
  const territorialContext = withPathnameHeader(request);

  // ── 0a. Redirect 301 onrender → canônico (defesa de bandwidth).
  const hostDecision = decideHostRedirect(request.headers.get("host"), pathname, search);
  if (hostDecision.kind === "redirect") {
    return respond(request, startedAt, NextResponse.redirect(hostDecision.target, 301));
  }

  // ── 0b. Bot guard: 429 para UA vazio em rotas SSR pesadas.
  const botDecision = decideBotGuard(request.headers.get("user-agent"), pathname);
  if (botDecision.kind === "block-429") {
    const blocked = new NextResponse(null, {
      status: 429,
      headers: { "Retry-After": "60", "X-Middleware-Bot-Guard": "ua-empty" },
    });
    return respond(request, startedAt, blocked);
  }

  // ── 0c. `/comprar?city_slug=` / `?state=` → 308 para o destino FINAL.
  //
  // Cedo de propósito: `/comprar` não tem gate territorial próprio (o
  // território está na QUERY, não no path), então não há 404 a preservar. E
  // quanto antes o salto sair, menos trabalho o Edge faz por uma URL que nem
  // vai renderizar. O destino — `/carros-em/[slug]` ou `/comprar/estado/[uf]`
  // — tem os gates dele e responde 404 sozinho quando a cidade não existe.
  const comprarLegacy = decideComprarLegacyQueryRedirect(pathname, search);
  if (comprarLegacy.kind === "redirect-permanent") {
    const url = request.nextUrl.clone();
    url.pathname = comprarLegacy.pathname;
    url.search = comprarLegacy.search;
    const moved = NextResponse.redirect(url, 308);
    moved.headers.set("X-Middleware-Canonical", "comprar-legacy-query");
    return respond(request, startedAt, moved);
  }

  // ── 1. Redirect 301 da rota legada `/:uf/regiao/:ancora` para canônica.
  const legacyAncoraMatch = LEGACY_ANCORA_RE.exec(pathname);
  if (legacyAncoraMatch) {
    const [, uf, ancora] = legacyAncoraMatch;
    const canonicalSlug = `${ancora}-${uf}`;
    const url = request.nextUrl.clone();
    url.pathname = `/carros-usados/regiao/${canonicalSlug}`;
    return respond(request, startedAt, NextResponse.redirect(url, 301));
  }

  // ── 2. Hard gate da Página Regional canônica.
  const regionalSlug = extractRegionalSlug(pathname);
  if (regionalSlug !== null) {
    const flagOn = isFlagEnabled();

    if (!flagOn) {
      const blocked = new NextResponse(null, { status: 404 });
      blocked.headers.set("X-Middleware-Regional", "blocked-flag-off");
      return respond(request, startedAt, blocked);
    }

    const validation = await validateRegionalSlug(regionalSlug);
    const action = decideRegionalMiddlewareAction(flagOn, validation);

    if (action.kind === "pass-valid") {
      // O invariante territorial precisa ser aplicado AQUI, e não no gate de
      // cidade lá embaixo: este bloco RETORNA CEDO para a família
      // `/carros-usados/regiao/:slug`, então o gate de 2b-bis nunca é
      // alcançado por ela.
      //
      // Foi um bug real (2026-08-06): `/carros-usados/regiao/altaneira-ce`
      // seguia em 200 depois do deploy, mesmo com a família já listada em
      // CITY_PREFIX_PATTERNS e com teste unitário verde — o teste exercitava
      // a função pura, que estava certa, mas nada verificava que o middleware
      // CHEGAVA a chamá-la. `validateRegionalSlug` responde "esta cidade
      // existe no catálogo", pergunta diferente de "esta cidade tem anúncio".
      const regionalCityMatch = extractCityScopedMatch(pathname);
      if (regionalCityMatch) {
        const citySet = await fetchPublicCitySet();
        const cityAction = decideCityExistenceAction(regionalCityMatch, citySet);

        if (cityAction.kind === "block-not-found") {
          const blocked = new NextResponse(null, { status: 404 });
          blocked.headers.set("X-Middleware-City-Gate", "blocked-no-active-ads");
          blocked.headers.set("X-Middleware-City-Family", regionalCityMatch.family);
          blocked.headers.set("X-Middleware-City-Gate-Source", cityAction.source);
          return respond(request, startedAt, blocked);
        }

        if (cityAction.kind === "block-unavailable") {
          return respond(
            request,
            startedAt,
            gateUnavailableResponse("city-regional", cityAction.reason)
          );
        }
      }

      // A normalização de query do fim do middleware é INALCANÇÁVEL para esta
      // família — o bloco regional retorna aqui. Mesma armadilha que fez o
      // gate de existência de cidade parecer aplicado e não estar (2026-08-06):
      // a função pura estava certa, o teste unitário verde, e nada verificava
      // que o middleware CHEGAVA a chamá-la. Por isso a chamada é repetida
      // aqui, e há teste de alcance cobrindo justamente este ponto.
      const regionalNormalization = decideQueryNormalizationRedirect(pathname, search);
      if (regionalNormalization.kind === "redirect-permanent") {
        const url = request.nextUrl.clone();
        url.pathname = regionalNormalization.pathname;
        url.search = regionalNormalization.search;
        const moved = NextResponse.redirect(url, 308);
        moved.headers.set("X-Middleware-Canonical", "query-normalization");
        return respond(request, startedAt, moved);
      }

      const passed = NextResponse.next(territorialContext);
      passed.headers.set("X-Middleware-Regional", "passed-valid");
      return respond(request, startedAt, passed);
    }
    if (action.kind === "block-not-found") {
      const blocked = new NextResponse(null, { status: 404 });
      blocked.headers.set("X-Middleware-Regional", "blocked-slug-invalid");
      return respond(request, startedAt, blocked);
    }
    if (action.kind === "block-unavailable") {
      const blocked = new NextResponse(null, { status: 503 });
      blocked.headers.set("X-Middleware-Regional", "blocked-unavailable");
      blocked.headers.set("X-Middleware-Regional-Reason", action.reason);
      blocked.headers.set("Retry-After", "60");
      return respond(request, startedAt, blocked);
    }
    const blocked = new NextResponse(null, { status: 404 });
    blocked.headers.set("X-Middleware-Regional", "blocked-flag-off");
    return respond(request, startedAt, blocked);
  }

  // ── 2b. Hard gate de UF inválida nas rotas territoriais por cidade:
  //        `/carros-usados/[uf]`, `/carros-em/[slug]`, `/comprar/estado/[uf]`,
  //        `/cidade/[slug]...` e (auditoria SEO 2026-07-03) as irmãs
  //        `/carros-baratos-em/[slug]`, `/carros-automaticos-em/[slug]` e
  //        `/tabela-fipe/[cidade]`.
  //
  // Bug Next 14.2: ISR + notFound() em server component retorna HTTP 200
  // com body not-found global. `force-dynamic` + notFound() em
  // generateMetadata ajudam mas em modo dev o status ainda comita 200.
  // Middleware emite 404 real ANTES do router pegar a rota, igual ao
  // hard gate Regional acima. Lógica pura em
  // `lib/middleware/territory-gate.ts` (testável isoladamente).
  const territoryDecision = decideTerritoryGate(pathname);
  if (territoryDecision.kind === "block-state-uf-invalid") {
    const blocked = new NextResponse(null, { status: 404 });
    blocked.headers.set("X-Middleware-State", "blocked-uf-invalid");
    return respond(request, startedAt, blocked);
  }
  if (territoryDecision.kind === "block-legacy-state-uf-invalid") {
    const blocked = new NextResponse(null, { status: 404 });
    blocked.headers.set("X-Middleware-State", "blocked-uf-invalid-legacy");
    return respond(request, startedAt, blocked);
  }
  if (territoryDecision.kind === "block-city-slug-invalid") {
    const blocked = new NextResponse(null, { status: 404 });
    blocked.headers.set("X-Middleware-City", "blocked-slug-invalid");
    return respond(request, startedAt, blocked);
  }

  // ── 2b-bis. Hard gate de EXISTÊNCIA de cidade (invariante territorial).
  //
  //   "Uma cidade só existe a partir do momento em que um anunciante publica
  //    um anúncio nela."
  //
  // O `territory-gate` acima é ESTRUTURAL: rejeita slug cuja UF final não é
  // uma UF brasileira real. Ele nunca soube nada sobre estoque — e era por
  // isso que `/carros-em/cidade-inventada-sp` e `/carros-em/altaneira-ce`
  // (município real, zero anúncios) respondiam 200 idênticos. Este gate é o
  // que faltava: consulta o conjunto derivado de anúncios ativos.
  //
  // Roda DEPOIS do estrutural de propósito: slug com UF falsa é barrado antes,
  // de graça, sem custar o fetch do conjunto.
  //
  // FAIL-SAFE em `unavailable` (2026-08-07): "não consegui verificar" vira 503,
  // nunca 200. Antes era `pass-unavailable`, e por isso uma env ausente no
  // BUILD desligava o invariante inteiro sem sintoma algum. O snapshot do
  // último conjunto confirmado absorve blips; só cold-start com backend fora
  // chega ao 503. Ver `lib/middleware/city-existence-gate.ts`.
  const cityMatch = extractCityScopedMatch(pathname);
  if (cityMatch) {
    const citySet = await fetchPublicCitySet();
    const cityAction = decideCityExistenceAction(cityMatch, citySet);

    if (cityAction.kind === "block-not-found") {
      const blocked = new NextResponse(null, { status: 404 });
      blocked.headers.set("X-Middleware-City-Gate", "blocked-no-active-ads");
      blocked.headers.set("X-Middleware-City-Family", cityMatch.family);
      blocked.headers.set("X-Middleware-City-Gate-Source", cityAction.source);
      return respond(request, startedAt, blocked);
    }

    if (cityAction.kind === "block-unavailable") {
      return respond(request, startedAt, gateUnavailableResponse("city", cityAction.reason));
    }

    // Passou: registra se a decisão veio de snapshot. Header de diagnóstico,
    // sem segredo — se `snapshot` aparecer em volume, o backend está fora e
    // alguém precisa saber ANTES de o snapshot expirar e virar 503.
    request.headers.set("x-cnc-city-gate-source", cityAction.source);
  }

  // ── 2b-ter. Mesmo invariante, um nível acima: UF sem NENHUM anúncio no
  //        estado inteiro também não existe.
  //
  // Sem isto, trocaríamos 5.570 páginas de cidade por 27 de estado — melhor,
  // mas ainda conteúdo vazio indexável. E pior: a página de UF linka de volta
  // para cidades, reabrindo o ciclo de descoberta que o gate de cidade fecha.
  //
  // Reusa o MESMO conjunto (agregado por estado na origem), não uma segunda
  // consulta — foi a existência de fontes paralelas que causou o bug original.
  // `else if` porque cidade e UF são mutuamente exclusivas por pathname; evita
  // o segundo fetch quando o primeiro gate já decidiu.
  else {
    const ufMatch = extractUfScopedMatch(pathname);
    if (ufMatch) {
      const citySet = await fetchPublicCitySet();
      const ufAction = decideUfExistenceAction(ufMatch, citySet);

      if (ufAction.kind === "block-not-found") {
        const blocked = new NextResponse(null, { status: 404 });
        blocked.headers.set("X-Middleware-City-Gate", "blocked-uf-no-active-ads");
        blocked.headers.set("X-Middleware-City-Family", ufMatch.family);
        blocked.headers.set("X-Middleware-City-Gate-Source", ufAction.source);
        return respond(request, startedAt, blocked);
      }

      if (ufAction.kind === "block-unavailable") {
        return respond(request, startedAt, gateUnavailableResponse("uf", ufAction.reason));
      }

      request.headers.set("x-cnc-city-gate-source", ufAction.source);
    }
  }

  // ── 2b-quater. `/comprar/cidade/[slug]` → 308 `/carros-em/[slug]`.
  //
  // DEPOIS dos gates, e isso é essencial: cidade com slug estruturalmente
  // inválido, ou sem nenhum anúncio ativo, precisa continuar respondendo 404
  // real. Se o redirect viesse antes, o 404 territorial viraria um 308 para
  // uma página que também dá 404 — cadeia inútil — ou, pior, um 200 emprestado.
  const legacyCity = decideLegacyCityRedirect(pathname, search);
  if (legacyCity.kind === "redirect-permanent") {
    const url = request.nextUrl.clone();
    url.pathname = legacyCity.pathname;
    url.search = legacyCity.search;
    const moved = NextResponse.redirect(url, 308);
    moved.headers.set("X-Middleware-Canonical", "legacy-city");
    return respond(request, startedAt, moved);
  }

  // ── 2c. Hard gate de existência para /veiculo/[slug] e
  //        /anuncios/[identifier] (auditoria 2026-05-24).
  //
  // Mesmo bug do Next 14.2.35: `notFound()` em server component — mesmo
  // com `dynamic = "force-dynamic"` + segment-level `not-found.tsx` —
  // renderiza o body do not-found mas comita HTTP 200 (soft-404).
  // Comprovado empiricamente em produção 2026-05-24. Sem este gate o
  // Googlebot indexa páginas de anúncios inexistentes.
  //
  // FAIL-SAFE (2026-08-07). A política anterior era `pass-unavailable` aqui,
  // sob o argumento de que 503 em cold-start quebraria todo anúncio real. O
  // argumento caiu por dois motivos:
  //
  //   1. Se o gate não consegue falar com o backend, o `page.tsx` também não
  //      consegue — e o que ele produz nesse caso é soft-404 200 (ou, no
  //      alias, 200 + meta refresh). "Não quebrar" era ilusão: já quebrava,
  //      com o status errado.
  //   2. O snapshot por identificador absorve o blip. Anúncio confirmado
  //      recentemente continua respondendo normalmente; só identificador
  //      nunca visto, durante backend fora, chega ao 503.
  //
  // Ver `lib/middleware/ad-detail-gate.ts`.
  const adDetailMatch = extractAdDetailMatch(pathname);
  if (adDetailMatch) {
    // Só o alias paga a leitura do corpo — é ele que precisa do slug canônico
    // para emitir o 308 aqui. `/veiculo/[slug]` continua checando só o status.
    const validation = await validateAdIdentifier(adDetailMatch.identifier, {
      readCanonicalSlug: adDetailMatch.route === "anuncios",
    });
    const action = decideAdDetailMiddlewareAction(validation);

    if (action.kind === "block-not-found") {
      const blocked = new NextResponse(null, { status: 404 });
      blocked.headers.set("X-Middleware-Ad", "blocked-not-found");
      blocked.headers.set("X-Middleware-Ad-Route", adDetailMatch.route);
      return respond(request, startedAt, blocked);
    }

    // Alias legado → canônica do anúncio, 308 HTTP real, sem HTML intermediário.
    // O `permanentRedirect()` do page.tsx segue no lugar como defesa: se o
    // backend não devolver slug, caímos nele.
    const alias = decideAdAliasRedirect(adDetailMatch, validation);
    if (alias.kind === "redirect-permanent" && alias.pathname !== pathname) {
      const url = request.nextUrl.clone();
      url.pathname = alias.pathname;
      url.search = "";
      const moved = NextResponse.redirect(url, 308);
      moved.headers.set("X-Middleware-Canonical", "ad-alias");
      return respond(request, startedAt, moved);
    }

    if (action.kind === "block-unavailable") {
      // Vale tanto para `/veiculo/[slug]` quanto para o alias sem slug em
      // snapshot: sem saber se o anúncio existe, 503. O caminho antigo
      // (`pass-unavailable`) levava a soft-404 200 na canônica e a
      // 200 + meta refresh no alias — os dois indexáveis.
      return respond(request, startedAt, gateUnavailableResponse("ad", action.reason));
    }

    // pass-valid: deixa o App Router renderizar normalmente.
    const passed = NextResponse.next(territorialContext);
    passed.headers.set("X-Middleware-Ad", "passed-valid");
    passed.headers.set("X-Middleware-Ad-Source", action.source);
    return respond(request, startedAt, passed);
  }

  // ── 2d. Hard gate de existência para a vitrine de loja `/lojas/[slug]`
  //        (auditoria SEO 2026-07-03).
  //
  // Mesmo soft-404 do Next 14.2: a page já chama `notFound()` quando
  // `fetchPublicDealer` devolve null, mas sem gate de middleware o status
  // comitava 200 (loja inexistente indexável). Política fail-open igual ao
  // ad-detail-gate: `unavailable` passa (não 503) para não derrubar lojas
  // reais em cold-start; a page mantém o `notFound()` como defesa.
  const dealerSlug = extractDealerSlug(pathname);
  if (dealerSlug !== null) {
    const validation = await validateDealerSlug(dealerSlug);
    const action = decideDealerMiddlewareAction(validation);

    if (action.kind === "block-not-found") {
      const blocked = new NextResponse(null, { status: 404 });
      blocked.headers.set("X-Middleware-Dealer", "blocked-not-found");
      return respond(request, startedAt, blocked);
    }

    if (action.kind === "block-unavailable") {
      return respond(request, startedAt, gateUnavailableResponse("dealer", action.reason));
    }

    const passed = NextResponse.next(territorialContext);
    passed.headers.set("X-Middleware-Dealer", "passed-valid");
    return respond(request, startedAt, passed);
  }

  // ── 2e. Hard gate de existência para `/blog/[cidade]` (rota dual post/hub;
  //        auditoria SEO 2026-07-03).
  //
  // Slug com forma de cidade real (`nome-uf`) → hub legítimo, passa sem bater
  // no backend. Qualquer outro slug → valida existência do post publicado
  // (`/api/public/blog/posts/:slug`); 404 → 404 real (mata o hub-fantasma
  // indexável). FAIL-SAFE em `unavailable`: 503, nunca 200 — o `notFound()` da
  // page produziria soft-404 com HTTP 200, que é o problema, não a defesa.
  const blogSlug = extractBlogSlug(pathname);
  if (blogSlug !== null) {
    if (isCityHubSlug(blogSlug)) {
      const passed = NextResponse.next(territorialContext);
      passed.headers.set("X-Middleware-Blog", "passed-city-hub");
      return respond(request, startedAt, passed);
    }

    const validation = await validateBlogPostSlug(blogSlug);
    const action = decideBlogMiddlewareAction(validation);

    if (action.kind === "block-not-found") {
      const blocked = new NextResponse(null, { status: 404 });
      blocked.headers.set("X-Middleware-Blog", "blocked-not-found");
      return respond(request, startedAt, blocked);
    }

    if (action.kind === "block-unavailable") {
      return respond(request, startedAt, gateUnavailableResponse("blog", action.reason));
    }

    const passed = NextResponse.next(territorialContext);
    passed.headers.set("X-Middleware-Blog", "passed-valid-post");
    return respond(request, startedAt, passed);
  }

  // ── 3. Redirects 301 legados (hífen único → barra). ────────────────

  const hyphenEm = /^\/carros-em-([^/]+)\/?$/.exec(pathname);
  if (hyphenEm?.[1]) {
    const slug = hyphenEm[1].replace(/\/+$/, "");
    if (slug) {
      const url = request.nextUrl.clone();
      url.pathname = `/carros-em/${slug}`;
      return respond(request, startedAt, NextResponse.redirect(url, 301));
    }
  }

  const hyphenBaratos = /^\/carros-baratos-em-([^/]+)\/?$/.exec(pathname);
  if (hyphenBaratos?.[1]) {
    const slug = hyphenBaratos[1].replace(/\/+$/, "");
    if (slug) {
      const url = request.nextUrl.clone();
      url.pathname = `/carros-baratos-em/${slug}`;
      return respond(request, startedAt, NextResponse.redirect(url, 301));
    }
  }

  const hyphenAuto = /^\/carros-automaticos-em-([^/]+)\/?$/.exec(pathname);
  if (hyphenAuto?.[1]) {
    const slug = hyphenAuto[1].replace(/\/+$/, "");
    if (slug) {
      const url = request.nextUrl.clone();
      url.pathname = `/carros-automaticos-em/${slug}`;
      return respond(request, startedAt, NextResponse.redirect(url, 301));
    }
  }

  if (pathname === "/painel/anuncios/novo") {
    const url = request.nextUrl.clone();
    url.pathname = "/anunciar/novo";
    return respond(request, startedAt, NextResponse.redirect(url, 301));
  }

  // Tela intermediária "Comece seu anúncio" removida (fricção): os CTAs da
  // landing vão direto ao login/formulário. Mantém 301 (não 404) por causa de
  // links externos / indexação antiga. Descarta `?tipo` (a landing não usa).
  if (pathname === "/anunciar/publicar") {
    const url = request.nextUrl.clone();
    url.pathname = "/anunciar";
    url.search = "";
    return respond(request, startedAt, NextResponse.redirect(url, 301));
  }

  const upgradeMatch = /^\/painel\/anuncios\/([^/]+)\/publicar\/?$/.exec(pathname);
  if (upgradeMatch?.[1]) {
    const url = request.nextUrl.clone();
    url.pathname = `/painel/anuncios/${upgradeMatch[1]}/upgrade`;
    return respond(request, startedAt, NextResponse.redirect(url, 301));
  }

  // ── 4. `/anuncios` → 308 `/comprar` (alias de listagem).
  //
  // A cadeia medida na auditoria: /anuncios respondia 200 canonicalizando para
  // /comprar, que por sua vez não era destino final. Duas URLs gastando crawl
  // budget para apontar para uma terceira. Agora é um salto só.
  const anunciosList = decideAnunciosListRedirect(pathname);
  if (anunciosList.kind === "redirect-permanent") {
    const url = request.nextUrl.clone();
    url.pathname = anunciosList.pathname;
    url.search = anunciosList.search;
    const moved = NextResponse.redirect(url, 308);
    moved.headers.set("X-Middleware-Canonical", "anuncios-list");
    return respond(request, startedAt, moved);
  }

  // ── 5. Normalização de query das vitrines (`sort=relevance`, `page=1`, …).
  //
  // Por último de propósito: só normaliza URL que já passou por todos os gates
  // e vai mesmo renderizar. Normalizar antes produziria 308 para uma página que
  // responderia 404 logo em seguida.
  const queryNormalization = decideQueryNormalizationRedirect(pathname, search);
  if (queryNormalization.kind === "redirect-permanent") {
    const url = request.nextUrl.clone();
    url.pathname = queryNormalization.pathname;
    url.search = queryNormalization.search;
    const moved = NextResponse.redirect(url, 308);
    moved.headers.set("X-Middleware-Canonical", "query-normalization");
    return respond(request, startedAt, moved);
  }

  // Fim: propaga o pathname para o RootLayout via header interno.
  return respond(request, startedAt, NextResponse.next(territorialContext));
}

/**
 * Matcher do middleware.
 *
 * Catch-all com exceções para recursos estáticos. Necessário desde
 * 2026-05-20 para que o redirect 301 onrender → canônico cobra TODAS
 * as rotas (incluindo home `/`), não apenas as territoriais.
 *
 * Excluídos do middleware (são recursos servidos diretamente):
 *   - /_next/*       (chunks, runtime data, otimizador)
 *   - /images/*      (assets estáticos, cache de 1 ano em next.config)
 *   - /favicon.ico   (rewrite para /images/favicon.png)
 *   - /robots.txt    (gerado por app/robots.ts)
 *   - /sitemap.xml   (sitemap raiz)
 *
 * Todas as outras rotas (HTML SSR, /api/*, /sitemaps/*) entram no
 * middleware para que os hosts onrender sejam redirecionados e o bot
 * guard / logging sejam aplicados nas rotas pesadas.
 */
export const config = {
  matcher: ["/((?!_next|images|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)"],
};
