import { NextRequest, NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { applyBffCookies, authenticateBffRequest } from "@/lib/http/bff-session";

/**
 * Upload das fotos — a única rota MULTIPART deste produto.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO USA `createBackendProxy`
 * ────────────────────────────────────────────────────────────────────────────
 * Aquele proxy lê o corpo com `request.text()`. Para JSON é correto; para
 * multipart destruiria o binário das imagens (e o `boundary` do Content-Type
 * deixaria de casar). Aqui o `FormData` é lido e REMONTADO, e o `Content-Type`
 * é deliberadamente OMITIDO — o `fetch` gera o cabeçalho com o boundary novo.
 * Repassar o Content-Type original seria anunciar um boundary que não existe
 * mais no corpo reconstruído.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTA ROTA NÃO DECIDE NADA
 * ────────────────────────────────────────────────────────────────────────────
 * Não escolhe o destino no storage, não gera chave, não valida formato e não
 * conhece o id do usuário. Tudo isso é do backend, que deriva o caminho de
 * `req.user.id` e de um UUID gerado lá. Só os arquivos do campo `photos` são
 * encaminhados — qualquer outro campo enviado junto é descartado aqui, e
 * ignorado lá.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 60_000;

function deny(status: number, error: string) {
  return NextResponse.json(
    { success: false, message: error },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const auth = await authenticateBffRequest(request);
  if (!auth.ok) {
    return deny(401, "Sua sessão expirou. Entre novamente.");
  }

  // Mesmo resolvedor que `createBackendProxy` usa — um segundo jeito de montar a
  // URL do backend divergiria do primeiro na próxima mudança de ambiente, e o
  // sintoma seria "só o upload não acha o servidor".
  const backendUrl = resolveInternalBackendApiUrl("/api/account/sale-requests/photos");
  if (!backendUrl) {
    return deny(502, "Backend não configurado.");
  }

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return deny(400, "Não foi possível ler as fotos enviadas.");
  }

  // Allowlist de campo: só `photos`, e só o que for arquivo com conteúdo.
  const files = incoming
    .getAll("photos")
    .filter((item): item is File => typeof File !== "undefined" && item instanceof File);

  if (files.length === 0) {
    return deny(400, "Nenhuma foto válida enviada. Use JPG, PNG ou WebP.");
  }

  const outgoing = new FormData();
  for (const file of files) outgoing.append("photos", file, file.name);

  // `Content-Type` fica de FORA: o fetch o define com o boundary do corpo novo.
  const headers: Record<string, string> = { ...auth.ctx.backendHeaders };
  delete headers["Content-Type"];
  delete headers["content-type"];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(backendUrl, {
      method: "POST",
      headers,
      body: outgoing,
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = await upstream.json().catch(() => null);

    return applyBffCookies(
      NextResponse.json(payload ?? {}, {
        status: upstream.status,
        headers: { "Cache-Control": "private, no-store" },
      }),
      auth.ctx
    );
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return deny(
      502,
      aborted
        ? "Tempo esgotado ao enviar as fotos. Tente com menos fotos por vez."
        : "Falha ao enviar as fotos."
    );
  } finally {
    clearTimeout(timeout);
  }
}
