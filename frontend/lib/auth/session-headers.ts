/**
 * Headers internos definidos pelo middleware após refresh de tokens.
 * Removidos do request de entrada (não confiar no cliente) e repassados ao SSR/API routes.
 */
export const MW_ACCESS_TOKEN_HEADER = "x-cnc-mw-access-token";
export const MW_REFRESH_TOKEN_HEADER = "x-cnc-mw-refresh-token";
