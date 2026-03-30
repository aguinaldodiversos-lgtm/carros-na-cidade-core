import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { resolvePostLoginRedirect } from "@/lib/auth/redirects";
import { AUTH_COOKIE_NAME, mergeMiddlewareSessionTokens } from "@/services/sessionService";

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

  if (
    normalized === "/login" ||
    normalized.startsWith("/login?") ||
    normalized === "/cadastro" ||
    normalized.startsWith("/cadastro?")
  ) {
    return undefined;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return undefined;
  }

  return normalized;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const cookieStore = cookies();
  const session = mergeMiddlewareSessionTokens(headers(), cookieStore.get(AUTH_COOKIE_NAME)?.value);
  const next = normalizeNextParam(searchParams?.next);
  const returnedFromDashboard = searchParams?.from_dashboard === "1";

  if (session?.accessToken && !returnedFromDashboard) {
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
