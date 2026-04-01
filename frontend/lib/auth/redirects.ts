export type SessionAccountType = "CPF" | "CNPJ" | "pending";

export function getDefaultDashboardRedirect(type: SessionAccountType) {
  if (type === "CNPJ") return "/dashboard-loja";
  return "/dashboard";
}

export function sanitizeInternalRedirect(value?: string | null) {
  if (!value) return null;

  const normalized = String(value).trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return null;
  }
  if (normalized.startsWith("/api/")) {
    return null;
  }
  if (normalized === "/login") {
    return null;
  }

  return normalized;
}

export function resolvePostLoginRedirect(type: SessionAccountType, next?: string | null) {
  return sanitizeInternalRedirect(next) ?? getDefaultDashboardRedirect(type);
}
