import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint interno de invalidação de cache do Next (Fase 4.1).
 *
 * Por que existe?
 * ---------------
 * O backend Node/Express e o frontend Next.js são serviços separados no
 * Render. Quando o admin salva uma alteração na Home (hero), o backend
 * grava no Postgres mas não pode invalidar o cache do Next remotamente.
 * Este endpoint fecha o loop: o BFF admin do Next (que recebeu o PATCH)
 * chama este endpoint **internamente** logo após o save, invalidando
 * tag `public-home-hero` e o path `/`.
 *
 * Autenticação
 * ------------
 * Aceita Bearer token igual a `REVALIDATE_TOKEN` (env compartilhada entre
 * BFF admin e este endpoint). Em DEV, se `REVALIDATE_TOKEN` for vazio
 * E NODE_ENV=development, libera para facilitar smoke local. Em produção
 * sem token configurada, retorna 503 (não silenciamente permissivo).
 *
 * Body
 * ----
 * { paths?: string[], tags?: string[] }
 * Ambos opcionais; pelo menos um precisa estar presente.
 *
 * Resposta
 * --------
 * 200 { ok: true, revalidated: { paths: [...], tags: [...] } } | 400 | 401 | 503
 *
 * Por que sem CSRF/cookies?
 * -------------------------
 * É chamado server-to-server (BFF Next → Next), não vem de browser. O
 * Bearer constante compartilhada é suficiente e mais simples que CSRF.
 */

const ALLOWED_PATHS = new Set<string>(["/"]);
const ALLOWED_TAGS = new Set<string>(["public-home-hero", "public-home"]);

function getExpectedToken(): { token: string | null; allowDev: boolean } {
  const token = (process.env.REVALIDATE_TOKEN || "").trim();
  const allowDev =
    process.env.NODE_ENV === "development" && !token;
  return { token: token || null, allowDev };
}

function isAuthorized(request: NextRequest): { ok: boolean; reason?: string } {
  const { token, allowDev } = getExpectedToken();
  if (!token) {
    if (allowDev) return { ok: true };
    return { ok: false, reason: "REVALIDATE_TOKEN não configurado" };
  }
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, reason: "missing-bearer" };
  if (match[1].trim() !== token) return { ok: false, reason: "bad-token" };
  return { ok: true };
}

export async function POST(request: NextRequest) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    const status = auth.reason === "REVALIDATE_TOKEN não configurado" ? 503 : 401;
    return NextResponse.json(
      { ok: false, error: auth.reason || "Não autorizado" },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body: { paths?: unknown; tags?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rawPaths = Array.isArray(body.paths) ? body.paths : [];
  const rawTags = Array.isArray(body.tags) ? body.tags : [];
  if (rawPaths.length === 0 && rawTags.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Informe paths ou tags." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const paths: string[] = [];
  for (const p of rawPaths) {
    if (typeof p !== "string") continue;
    const trimmed = p.trim();
    if (ALLOWED_PATHS.has(trimmed)) paths.push(trimmed);
  }
  const tags: string[] = [];
  for (const t of rawTags) {
    if (typeof t !== "string") continue;
    const trimmed = t.trim();
    if (ALLOWED_TAGS.has(trimmed)) tags.push(trimmed);
  }

  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // Silenciar: caller já saberá pelo retorno; falha aqui não é fatal.
    }
  }
  for (const t of tags) {
    try {
      revalidateTag(t);
    } catch {
      // idem
    }
  }

  return NextResponse.json(
    { ok: true, revalidated: { paths, tags } },
    { headers: { "Cache-Control": "no-store" } }
  );
}
