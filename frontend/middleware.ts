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
  decideAdDetailMiddlewareAction,
  extractAdDetailMatch,
  validateAdIdentifier,
} from "@/lib/middleware/ad-detail-gate";
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
 * 3. **Redirects 301 de outras URLs legadas** (preservados):
 *    - /carros-{em,baratos-em,automaticos-em}-[slug] → versão com `/`
 *    - /painel/anuncios/novo → /anunciar/novo
 *    - /painel/anuncios/[id]/publicar → /upgrade
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

  // ── 2c. Hard gate de existência para /veiculo/[slug] e
  //        /anuncios/[identifier] (auditoria 2026-05-24).
  //
  // Mesmo bug do Next 14.2.35: `notFound()` em server component — mesmo
  // com `dynamic = "force-dynamic"` + segment-level `not-found.tsx` —
  // renderiza o body do not-found mas comita HTTP 200 (soft-404).
  // Comprovado empiricamente em produção 2026-05-24. Sem este gate o
  // Googlebot indexa páginas de anúncios inexistentes.
  //
  // Política diferente do `regional-page-guard`: `unavailable` aqui
  // resulta em `pass-unavailable` (não 503), porque este gate roda em
  // TODO request a /veiculo/* — falhar 503 em cold-start do backend
  // quebraria todo anúncio real. A defesa em profundidade vem do
  // `page.tsx` que ainda chama `notFound()` quando `fetchAdDetail`
  // retorna null. Ver `lib/middleware/ad-detail-gate.ts`.
  const adDetailMatch = extractAdDetailMatch(pathname);
  if (adDetailMatch) {
    const validation = await validateAdIdentifier(adDetailMatch.identifier);
    const action = decideAdDetailMiddlewareAction(validation);

    if (action.kind === "block-not-found") {
      const blocked = new NextResponse(null, { status: 404 });
      blocked.headers.set("X-Middleware-Ad", "blocked-not-found");
      blocked.headers.set("X-Middleware-Ad-Route", adDetailMatch.route);
      return respond(request, startedAt, blocked);
    }

    if (action.kind === "pass-unavailable") {
      const passed = NextResponse.next(territorialContext);
      passed.headers.set("X-Middleware-Ad", "passed-unavailable");
      passed.headers.set("X-Middleware-Ad-Reason", action.reason);
      return respond(request, startedAt, passed);
    }

    // pass-valid: deixa o App Router renderizar normalmente.
    const passed = NextResponse.next(territorialContext);
    passed.headers.set("X-Middleware-Ad", "passed-valid");
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

    if (action.kind === "pass-unavailable") {
      const passed = NextResponse.next(territorialContext);
      passed.headers.set("X-Middleware-Dealer", "passed-unavailable");
      passed.headers.set("X-Middleware-Dealer-Reason", action.reason);
      return respond(request, startedAt, passed);
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
  // indexável). Fail-open em `unavailable` (a page mantém o `notFound()`).
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

    if (action.kind === "pass-unavailable") {
      const passed = NextResponse.next(territorialContext);
      passed.headers.set("X-Middleware-Blog", "passed-unavailable");
      passed.headers.set("X-Middleware-Blog-Reason", action.reason);
      return respond(request, startedAt, passed);
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

  const upgradeMatch = /^\/painel\/anuncios\/([^/]+)\/publicar\/?$/.exec(pathname);
  if (upgradeMatch?.[1]) {
    const url = request.nextUrl.clone();
    url.pathname = `/painel/anuncios/${upgradeMatch[1]}/upgrade`;
    return respond(request, startedAt, NextResponse.redirect(url, 301));
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
