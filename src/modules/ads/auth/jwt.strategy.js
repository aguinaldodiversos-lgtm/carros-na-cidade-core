/**
 * DEPRECATED — arquivo legado com fallback de secret hard-coded.
 * Redirecionado para implementação canônica em src/modules/auth/jwt.strategy.js.
 * NÃO adicionar lógica aqui.
 */
export {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../../auth/jwt.strategy.js";
