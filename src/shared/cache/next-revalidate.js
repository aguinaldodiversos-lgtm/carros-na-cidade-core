/**
 * Canal interno backend → Next para invalidar o cache de dados do frontend
 * (Fase 4.10A).
 *
 * POR QUE EXISTE
 * --------------
 * Backend e frontend são serviços separados. `invalidateAdsCachesAfterMutation`
 * limpa o Redis do backend, mas o fetch cache do Next vive no processo do
 * frontend e continuaria servindo a resposta antiga até o `revalidate` expirar
 * (60s nas vitrines). Para moderação isso não serve: depois que o admin recebe
 * "bloqueado", a próxima leitura pública não pode ainda mostrar o anúncio.
 *
 * REUSO, NÃO INFRAESTRUTURA NOVA
 * ------------------------------
 * O endpoint `/api/revalidate` já existia desde a Fase 4.1 (usado pelo BFF
 * admin da Home e do Blog), com Bearer `REVALIDATE_TOKEN` e **allowlist** de
 * paths e tags. Este módulo só acrescenta o remetente que faltava: o backend
 * Express. Nada de fila, outbox ou event bus.
 *
 * FALHA-SOFT, DE PROPÓSITO
 * ------------------------
 * Um bloqueio administrativo válido não pode ser desfeito porque o frontend
 * ficou fora do ar. A fonte de verdade é o banco: o anúncio segue `blocked`, o
 * detalhe segue 404 e a API pública segue sem devolvê-lo. Se este canal
 * falhar, o TTL volta a ser a última linha de defesa — o pior caso é a janela
 * antiga, nunca um anúncio que devia estar bloqueado voltar a ser publicável.
 * Por isso a função nunca lança; devolve o resultado para quem quiser logar.
 */

import { logger } from "../logger.js";

/**
 * Precisa bater com `PUBLIC_ADS_CACHE_TAG` em
 * `frontend/lib/cache/public-ads-tag.ts` e constar de `ALLOWED_TAGS` em
 * `frontend/app/api/revalidate/route.ts`. Teste de sincronia trava os três.
 */
export const PUBLIC_ADS_CACHE_TAG = "public-ads";

const REVALIDATE_TIMEOUT_MS = 5_000;

/**
 * Resolve a URL do frontend pelas MESMAS envs já usadas no projeto
 * (payments.getFrontendPublicUrl, workers, SEO).
 *
 * Diferença: aqui `http://localhost` é aceito. `getFrontendPublicUrl` exige
 * https porque a URL vai para o Mercado Pago; esta chamada é interna e precisa
 * funcionar em desenvolvimento e nos testes.
 */
export function resolveFrontendBaseUrl(env = process.env) {
  const value =
    env.FRONTEND_URL?.trim() ||
    env.SITE_URL?.trim() ||
    env.NEXT_PUBLIC_SITE_URL?.trim() ||
    env.PUBLIC_SITE_URL?.trim() ||
    "";
  return value.replace(/\/+$/, "");
}

/**
 * Pede ao Next que invalide as tags/paths informados.
 *
 * @returns {Promise<{ ok: boolean, reason?: string, status?: number }>}
 *          Nunca rejeita. `ok:false` sinaliza que o cache do Next segue quente
 *          e que o TTL será o responsável por limpá-lo.
 */
export async function requestNextRevalidate({ tags = [], paths = [] } = {}, env = process.env) {
  if (!tags.length && !paths.length) {
    return { ok: false, reason: "nothing-to-revalidate" };
  }

  const baseUrl = resolveFrontendBaseUrl(env);
  if (!baseUrl) {
    // Sem URL de frontend não há canal. Não é erro do bloqueio.
    logger.warn(
      { domain: "cache.next-revalidate", tags },
      "[next-revalidate] URL do frontend não configurada — cache do Next expira por TTL"
    );
    return { ok: false, reason: "frontend-url-missing" };
  }

  const token = String(env.REVALIDATE_TOKEN || "").trim();
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  // O token NUNCA é logado, nem em erro. Vai só no header.
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REVALIDATE_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/revalidate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tags, paths }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn(
        { domain: "cache.next-revalidate", status: response.status, tags },
        "[next-revalidate] frontend recusou a invalidação — cache expira por TTL"
      );
      return { ok: false, reason: "http-error", status: response.status };
    }
    return { ok: true, status: response.status };
  } catch (err) {
    logger.warn(
      { domain: "cache.next-revalidate", err: err?.message || String(err), tags },
      "[next-revalidate] falha de rede na invalidação — cache expira por TTL"
    );
    return { ok: false, reason: "network-error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Invalida as vitrines públicas de anúncios no Next.
 *
 * `/comprar` vai junto como path porque é a rota do catálogo e o `revalidatePath`
 * cobre também o render da página, não só o fetch — as duas coisas juntas
 * fecham o caminho que o visitante realmente percorre.
 */
export async function revalidatePublicAdsOnNext(env = process.env) {
  return requestNextRevalidate({ tags: [PUBLIC_ADS_CACHE_TAG], paths: ["/", "/comprar"] }, env);
}
