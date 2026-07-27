import { NextRequest, NextResponse } from "next/server";
import {
  BackendApiError,
  deleteOwnedAd,
  fetchOwnedAd,
  patchOwnedAdStatus,
  updateOwnedAd,
  type UpdateOwnedAdPayload,
} from "@/lib/account/backend-account";
import { pickEditablePayload } from "@/lib/account/editable-ad-payload";
import { adDetailTagsFor } from "@/lib/ads/ad-cache-tags";
import { authenticateBffRequest, applyBffCookies } from "@/lib/http/bff-session";
import { revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";

/**
 * Derruba o cache do detalhe público do anúncio.
 *
 * Sem isto, o `next: { revalidate: 300 }` do `fetchAdDetail` fazia a edição do
 * lojista levar até 5 minutos para aparecer — ele salvava, conferia, via o
 * valor antigo e concluía que não tinha salvado.
 *
 * Invalida por ID e por SLUG porque a leitura pode ter cacheado por qualquer
 * um dos dois: a página pública lê por slug, o painel escreve por id.
 *
 * Nunca lança: falhar a invalidação não pode derrubar um salvamento que já
 * foi persistido. Pior caso, volta a defasagem de 5 minutos — que é o
 * comportamento anterior, não uma regressão.
 */
function revalidarDetalhe(input: { id?: string | number | null; slug?: string | null }) {
  for (const tag of adDetailTagsFor(input)) {
    try {
      revalidateTag(tag);
    } catch (error) {
      console.error("[ads/:id] revalidateTag falhou", tag, error);
    }
  }
}

/**
 * Slug do anúncio na resposta do backend, tolerante à forma.
 *
 * As três rotas devolvem envelopes diferentes (`{ data }` no PUT/DELETE,
 * `{ ad }` no PATCH) e nem todos os tipos declaram `slug`. Ler de forma
 * defensiva é melhor que castar em cada caller: slug ausente só significa que
 * invalidamos por id, e o teto de `revalidate` cobre o resto.
 */
function slugDaResposta(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const envelope = payload as Record<string, unknown>;
  for (const candidato of [envelope.data, envelope.ad, envelope]) {
    if (candidato && typeof candidato === "object") {
      const slug = (candidato as Record<string, unknown>).slug;
      if (typeof slug === "string" && slug.trim()) return slug.trim();
    }
  }
  return null;
}

type Params = {
  params: {
    id: string;
  };
};

type PatchPayload = {
  action?: "pause" | "activate";
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const payload = await fetchOwnedAd(auth.ctx.session, params.id);
    return applyBffCookies(NextResponse.json(payload), auth.ctx);
  } catch (error) {
    console.error("[GET /api/ads/:id]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Falha ao buscar anuncio." }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as PatchPayload;
    const action = body.action;

    if (action !== "pause" && action !== "activate") {
      return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
    }

    const updated = await patchOwnedAdStatus(auth.ctx.session, params.id, action);
    // Pausar/reativar muda a VISIBILIDADE pública — cache velho serviria um
    // anúncio pausado (ou esconderia um reativado) por até 5 minutos.
    revalidarDetalhe({ id: params.id, slug: slugDaResposta(updated) });
    return applyBffCookies(NextResponse.json({ ad: updated.ad }), auth.ctx);
  } catch (error) {
    console.error("[PATCH /api/ads/:id]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Falha ao atualizar anuncio." }, { status: 502 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const raw = await request.json().catch(() => ({}));
    const payload = pickEditablePayload(raw);

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "Nenhum campo editável foi enviado." }, { status: 400 });
    }

    const updated = await updateOwnedAd(auth.ctx.session, params.id, payload);
    revalidarDetalhe({ id: params.id, slug: slugDaResposta(updated) });
    return applyBffCookies(NextResponse.json(updated), auth.ctx);
  } catch (error) {
    // Propaga status/mensagem/código do backend (403/404/409/400) para a UI
    // exibir o motivo certo (sem dono → 404; terceiro → 403; status travado →
    // 409; payload inválido → 400). Demais falhas viram 502 genérico.
    if (error instanceof BackendApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 }
      );
    }
    console.error("[PUT /api/ads/:id]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Falha ao atualizar anuncio." }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const removed = await deleteOwnedAd(auth.ctx.session, params.id);
    // Remoção é soft-delete: o anúncio sai da vitrine. Sem invalidar, a página
    // continuaria servindo um anúncio removido.
    revalidarDetalhe({ id: params.id, slug: slugDaResposta(removed) });
    return applyBffCookies(NextResponse.json(removed), auth.ctx);
  } catch (error) {
    console.error("[DELETE /api/ads/:id]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Falha ao remover anuncio." }, { status: 502 });
  }
}
