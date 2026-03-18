/**
 * Shim de compatibilidade.
 * Mantém módulos legados apontando para a infraestrutura única de banco.
 */
import pool, {
  query,
  withTransaction,
  healthcheck,
  closeDatabasePool,
  getPoolConfig,
} from "../infrastructure/database/db.js";

export { pool, query, withTransaction, healthcheck, closeDatabasePool, getPoolConfig };
export default pool;
