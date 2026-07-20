/**
 * Definição CENTRAL das rotas de autenticação. Use estas constantes em vez de
 * strings soltas ("/login", "/cadastro", ...) — foi uma rota hand-typed
 * inexistente (`/entrar`) em botões que gerou 404s no funil. Centralizar evita
 * a recorrência: se o path mudar, muda num lugar só.
 */
export const AUTH_ROUTES = {
  login: "/login",
  register: "/cadastro",
  recoverPassword: "/recuperar-senha",
} as const;

/**
 * Monta o destino de login preservando o `next`. O `next` é VALIDADO no
 * consumo (página/route de login, via `sanitizeInternalRedirect`) — aqui apenas
 * encodamos para transporte na querystring.
 */
export function loginWithNext(next: string): string {
  return `${AUTH_ROUTES.login}?next=${encodeURIComponent(next)}`;
}
