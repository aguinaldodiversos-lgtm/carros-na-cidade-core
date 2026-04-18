/**
 * Decide a configuração SSL a ser passada para `pg.Pool`.
 *
 * Regra final (em ordem de precedência):
 *   1. Override explícito por env: PG_SSL_MODE / PGSSLMODE
 *        - "disable"                                 → SSL off
 *        - "require"|"prefer"|"verify-ca"|"verify-full"|"allow" → SSL on
 *   2. Query string do DATABASE_URL: sslmode=... ou ssl=true|false
 *   3. Flag booleana legada: PG_SSL_ENABLED / PGSSL
 *        - "false" explícito                          → SSL off
 *   4. Host local (localhost, 127.0.0.1, ::1, 0.0.0.0, host.docker.internal,
 *      "postgres"/"db" — aliases de service container) → SSL off
 *        - Mesmo se PG_SSL_ENABLED=true, host local vence; para forçar SSL
 *          em host local use PG_SSL_MODE=require.
 *   5. Host remoto → SSL on (caso gerenciado típico: Render, Supabase etc.).
 *
 * `rejectUnauthorized` é controlado por PG_SSL_REJECT_UNAUTHORIZED (default: false).
 */

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "host.docker.internal",
  "postgres",
  "db",
]);

const ENABLED_SSL_MODES = new Set(["require", "prefer", "verify-ca", "verify-full", "allow"]);

function coerceBool(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return undefined;
}

function parseUrl(connectionString) {
  try {
    return new URL(String(connectionString || ""));
  } catch {
    return null;
  }
}

function extractSslModeFromUrl(url) {
  if (!url) return null;
  const mode = url.searchParams.get("sslmode");
  if (mode) return mode.toLowerCase();
  const ssl = url.searchParams.get("ssl");
  const sslBool = coerceBool(ssl);
  if (sslBool === true) return "require";
  if (sslBool === false) return "disable";
  return null;
}

function isLocalHostname(host) {
  if (!host) return false;
  return LOCAL_HOSTS.has(host.toLowerCase());
}

export function resolveSslConfig(connectionString, envSource = process.env) {
  const rejectUnauthorized = coerceBool(envSource.PG_SSL_REJECT_UNAUTHORIZED) ?? false;
  const sslOn = { rejectUnauthorized };

  // 1) Override explícito por env
  const modeOverride = String(envSource.PG_SSL_MODE ?? envSource.PGSSLMODE ?? "")
    .trim()
    .toLowerCase();
  if (modeOverride === "disable") return false;
  if (ENABLED_SSL_MODES.has(modeOverride)) return sslOn;

  // 2) Query string do DATABASE_URL
  const url = parseUrl(connectionString);
  const urlMode = extractSslModeFromUrl(url);
  if (urlMode === "disable") return false;
  if (urlMode && ENABLED_SSL_MODES.has(urlMode)) return sslOn;

  // 3) Flag booleana legada (apenas o "false" explícito desliga)
  const explicitBool = coerceBool(envSource.PG_SSL_ENABLED) ?? coerceBool(envSource.PGSSL);
  if (explicitBool === false) return false;

  // 4) Host local / service container
  if (isLocalHostname(url?.hostname)) return false;

  // 5) Host remoto → SSL on por padrão (Render, Supabase etc.)
  return sslOn;
}

export const __testing = { coerceBool, parseUrl, extractSslModeFromUrl, isLocalHostname };
