import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const proxy = createBackendProxy({
  basePath: "/api/account/personal",
  timeoutMessage: "Tempo esgotado ao carregar sua conta.",
});

// Rota estática: nunca pressupor params do Next (regressão PR #90).
export async function GET(request: NextRequest) {
  return proxy(request, { params: {} });
}

export async function PUT(request: NextRequest) {
  return proxy(request, { params: {} });
}
