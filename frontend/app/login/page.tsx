import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { resolvePostLoginRedirect } from "@/lib/auth/redirects";
import { AUTH_COOKIE_NAME, getSessionUserFromCookieValue } from "@/services/sessionService";

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
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const cookieStore = cookies();
  const session = getSessionUserFromCookieValue(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  const next = searchParams?.next;
  if (session) {
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
