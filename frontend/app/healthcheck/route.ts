import { NextResponse } from "next/server";

/**
 * Probe de saúde dedicado do serviço de frontend no Render.
 *
 * ── Por que existe ───────────────────────────────────────────────────────
 * Hoje `healthCheckPath: /` (render.yaml) e, por isso, `/` é a ÚNICA rota
 * isenta do redirect de host em `lib/middleware/host-redirect.ts`. O efeito
 * colateral é que `https://carros-na-cidade-portal.onrender.com/` serve 177 KB
 * de HTML com `index, follow` — a última superfície do domínio padrão do
 * Render ainda rastreável.
 *
 * Não dá para simplesmente remover a isenção: o probe do Render receberia 301,
 * o serviço seria marcado como não saudável e o deploy entraria em loop de
 * restart. Este endpoint é o pré-requisito para desamarrar as duas coisas —
 * com o health check apontando para cá, `/` deixa de precisar de isenção.
 *
 * ── Ordem de implantação (importa) ───────────────────────────────────────
 * 1. Publicar esta rota (aditivo, não quebra nada).
 * 2. Trocar o Health Check Path para `/healthcheck` NO DASHBOARD do Render —
 *    a config de lá não é versionada e vence o `render.yaml`.
 * 3. Só então remover `/` da isenção em `host-redirect.ts`.
 *
 * Inverter 2 e 3 derruba o serviço.
 *
 * ── NÃO "MELHORE" ESTE ENDPOINT ──────────────────────────────────────────
 * A trivialidade é o requisito, não uma pendência. Ele responde exatamente
 * uma pergunta: "o processo Next está de pé e roteando?".
 *
 * NÃO acrescente checagem de banco, de backend, de Redis ou de env. O Render
 * REINICIA o serviço quando o probe falha — então um health check que consulta
 * dependência externa converte "o banco piscou" em "o frontend entra em
 * restart loop", e o site inteiro cai por causa de algo que só afetaria
 * algumas rotas. A dependência ficaria indisponível de qualquer jeito; a
 * diferença é derrubar junto o que ainda funcionava.
 *
 * Se você precisa monitorar saúde de dependências, faça em endpoint SEPARADO,
 * que ninguém aponte como healthCheckPath.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { ok: true, service: "carros-na-cidade-portal" },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}

/** Render pode usar HEAD no probe dependendo da configuração. */
export function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
