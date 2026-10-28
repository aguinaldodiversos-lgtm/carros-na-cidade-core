import { NextResponse } from "next/server";
import { fetchPlans } from "@/lib/account/backend-account";

export const dynamic = "force-dynamic";

/**
 * Compatibilidade somente leitura. A fonte canônica é o PostgreSQL.
 * Edição comercial exclusivamente via /api/admin/plans/:id, com sessão
 * administrativa, validação e registro em admin_actions.
 */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const plans = await fetchPlans({ activeOnly: false });
    const plan = plans.find((p) => p.id === params.id && p.public_visible !== false);
    if (!plan) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });
    return NextResponse.json({ plan }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Catálogo temporariamente indisponível" }, { status: 503 });
  }
}

/** Endpoint legado inseguro aposentado: nunca modifica um catálogo em memória. */
export async function PATCH() {
  return NextResponse.json(
    { error: "Use o Admin Comercial autenticado para alterar planos." },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
