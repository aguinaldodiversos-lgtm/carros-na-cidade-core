import "server-only";

/**
 * Headers de autenticacao interna entre frontend SSR/BFF e backend core.
 *
 * Contrato (alinhado com src/shared/middlewares/bot-blocker.middleware.js):
 *   User-Agent: cnc-internal/1.0
 *   X-Internal-Token: <process.env.INTERNAL_API_TOKEN>
 *
 * Por que server-only?
 * - Bundles do client NUNCA podem conter INTERNAL_API_TOKEN. `import "server-only"`
 *   faz o Next abortar o build se algum client component importar este arquivo.
 *
 * Por que enviar User-Agent mesmo sem token?
 * - O UA identifica a origem da chamada nos logs de bandwidth-diagnostics
 *   (categoria `bot:cnc-internal`). Mesmo em ambiente de dev sem token, o UA
 *   continua util para depurar trafego. O backend sem token configurado
 *   simplesmente nao reconhece como internal autenticado.
 *
 * Por que nao logar o token aqui?
 * - INTERNAL_API_TOKEN e secret. Esta funcao nao deve aparecer em
 *   nenhum log de debug. Quem chamar e responsavel por nunca printar o
 *   objeto retornado.
 */

export const INTERNAL_USER_AGENT = "cnc-internal/1.0";

const INTERNAL_TOKEN_HEADER = "X-Internal-Token";
const USER_AGENT_HEADER = "User-Agent";

export type InternalHeaderOptions = {
  /**
   * Quando false, omite o X-Internal-Token mesmo se INTERNAL_API_TOKEN
   * estiver configurado. Util para fetches que NAO precisam autorizar
   * (ex: webhooks publicos do MercadoPago vindos do backend) mas mantem
   * a categoria do UA.
   */
  includeToken?: boolean;
};

function readInternalToken(): string {
  return String(process.env.INTERNAL_API_TOKEN || "").trim();
}

/**
 * Retorna os headers de autenticacao interna como objeto plano.
 *
 * Em producao com INTERNAL_API_TOKEN configurado, retorna:
 *   { "User-Agent": "cnc-internal/1.0", "X-Internal-Token": "..." }
 *
 * Sem token configurado, retorna apenas:
 *   { "User-Agent": "cnc-internal/1.0" }
 *
 * O backend, com BAD_BOTS_BLOCKED=true e sem aceitar a flag de compat
 * LEGACY_BFF_COMPAT, ira responder 429 quando UA cnc-internal/1.0 chegar
 * sem token correto. Isso e intencional: melhor descobrir cedo no deploy
 * do que silenciosamente continuar funcionando via compat fraca.
 */
export function buildInternalBackendHeaders(
  options: InternalHeaderOptions = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    [USER_AGENT_HEADER]: INTERNAL_USER_AGENT,
  };

  const includeToken = options.includeToken !== false;
  if (includeToken) {
    const token = readInternalToken();
    if (token) {
      headers[INTERNAL_TOKEN_HEADER] = token;
    } else if (process.env.NODE_ENV === "production") {
      // Em producao com INTERNAL_API_TOKEN ausente, o backend vai rejeitar
      // como UA cnc-internal/1.0 nao autenticado. Emite warning unico para
      // ser observavel nos logs do Render sem vazar nada secreto.
      logMissingTokenOnce();
    }
  }

  return headers;
}

let missingTokenWarned = false;
function logMissingTokenOnce() {
  if (missingTokenWarned) return;
  missingTokenWarned = true;
  // eslint-disable-next-line no-console
  console.error(
    "[internal-backend-headers] INTERNAL_API_TOKEN ausente em producao. Fetches SSR/BFF serao bloqueados pelo backend (UA cnc-internal/1.0 sem token = 429). Configure no Render Dashboard > frontend > Environment."
  );
}

/**
 * Marker exposto para testes que precisam validar que o UA esta correto
 * sem reimportar o symbol diretamente.
 */
export const INTERNAL_HEADER_NAMES = {
  USER_AGENT: USER_AGENT_HEADER,
  INTERNAL_TOKEN: INTERNAL_TOKEN_HEADER,
} as const;
