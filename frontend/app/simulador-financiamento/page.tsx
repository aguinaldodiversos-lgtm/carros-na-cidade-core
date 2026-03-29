// frontend/app/simulador-financiamento/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";
import { DEFAULT_PUBLIC_CITY_SLUG } from "@/lib/site/public-config";

export default async function SimuladorFinanciamentoIndexPage() {
  const cookieStore = await cookies();
  const fromCookie = parseCityCookieValue(cookieStore.get(CITY_COOKIE_NAME)?.value);
  const slug = fromCookie?.slug ?? DEFAULT_PUBLIC_CITY_SLUG;
  redirect(`/simulador-financiamento/${encodeURIComponent(slug)}`);
}
