import { NextResponse } from "next/server";
import { fetchPublicCitySet } from "@/lib/city/public-city-set";

/**
 * Conjunto de cidades públicas para o CLIENTE.
 *
 * Existe porque o estado de cidade vive no navegador (localStorage + cookie) e
 * precisa saber quando a cidade guardada deixou de existir — cidade que perde o
 * último anúncio agora responde 404, e o cabeçalho montaria links quebrados.
 *
 * Ver `docs/architecture/invariante-cidade-existe-se-tem-anuncio.md`.
 *
 * Só devolve os SLUGS, sem as contagens: o cliente precisa de pertinência, não
 * de volume, e a lista menor é mais barata de trafegar em toda navegação.
 *
 * Falha vira 503 com `ok:false`, NUNCA 200 com lista vazia. Lista vazia
 * significaria "nenhuma cidade existe" e o cliente descartaria a cidade de todo
 * mundo — a mesma armadilha do payload malformado no gate do servidor.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const set = await fetchPublicCitySet();

  if (!set) {
    return NextResponse.json(
      { ok: false, slugs: null },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { ok: true, slugs: Object.keys(set.cities) },
    {
      // 60s alinhado ao TTL do gate no middleware e ao cacheGet do backend: o
      // conjunto muda raramente e não justifica uma requisição por navegação.
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    }
  );
}
