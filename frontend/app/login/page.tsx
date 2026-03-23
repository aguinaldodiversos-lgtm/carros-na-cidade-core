import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { resolvePostLoginRedirect } from "@/lib/auth/redirects";
<<<<<<< HEAD
import {
  AUTH_COOKIE_NAME,
  getSessionDataFromCookieValue,
} from "@/services/sessionService";
=======
import { AUTH_COOKIE_NAME, getSessionDataFromCookieValue } from "@/services/sessionService";
>>>>>>> e316506 (fix: corrigir footer e blog fallback)

export const metadata: Metadata = {
  title: "Login",
  description: "Acesse sua conta de anunciante no portal Carros na Cidade.",
  alternates: {
    canonical: "/login",
  },
};

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: {
    next?: string;
    from_dashboard?: string;
  };
};

function normalizeNextParam(value?: string) {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) return undefined;

  // evita loop para rotas de auth
  if (
    normalized === "/login" ||
    normalized.startsWith("/login?") ||
    normalized === "/cadastro" ||
    normalized.startsWith("/cadastro?")
  ) {
    return undefined;
  }

  // impede redirecionamento externo
  if (/^https?:\/\//i.test(normalized)) {
    return undefined;
  }

  return normalized;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const cookieStore = cookies();
<<<<<<< HEAD
  const cookieValue = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const session = getSessionDataFromCookieValue(cookieValue);
  const next = normalizeNextParam(searchParams?.next);

  // só considera sessão válida para redirect se houver token
  if (session?.accessToken) {
=======
  const session = getSessionDataFromCookieValue(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  const next = searchParams?.next;
  const returnedFromDashboard = searchParams?.from_dashboard === "1";
  if (session?.accessToken && !returnedFromDashboard) {
>>>>>>> e316506 (fix: corrigir footer e blog fallback)
    redirect(resolvePostLoginRedirect(session.type, next));
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-md">
        <LoginForm next={next} />
      </div>
    </main>
  );
}
