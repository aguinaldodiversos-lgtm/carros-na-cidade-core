import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AUTH_COOKIE_NAME,
  getSessionDataFromCookieValue,
} from "@/services/sessionService";

export const dynamic = "force-dynamic";

export default function DashboardLojaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieValue(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );

  if (!session?.id || !session.accessToken) {
    redirect("/login?next=%2Fdashboard-loja");
  }

  if (session.type !== "CNPJ") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
