import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { resolvePostLoginRedirect } from "@/lib/auth/redirects";
import {
  AUTH_COOKIE_NAME,
  getSessionDataFromCookieValue,
} from "@/services/sessionService";

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
    reason?: string;
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
  const cookieValue = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const session = getSessionDataFromCookieValue(cookieValue);
  const next = normalizeNextParam(searchParams?.next);
  const reason = typeof searchParams?.reason === "string" ? searchParams.reason.trim() : "";

  // só considera sessão válida para redirect se houver token
  if (session?.accessToken) {
    redirect(resolvePostLoginRedirect(session.type, next));
  }

  const sessionExpiredNotice =
    reason === "session_expired" ? (
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Sua sessão expirou. Faça login novamente para continuar.
      </div>
    ) : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-md">
        {sessionExpiredNotice}
        <LoginForm next={next} />
      </div>
    </main>
  );
}
