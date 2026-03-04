import type { Metadata } from "next";
import RecoverPasswordPanel from "@/components/auth/RecoverPasswordPanel";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";

export const metadata: Metadata = {
  title: "Recuperar senha",
  description: "Recupere o acesso da sua conta no Carros na Cidade.",
  alternates: {
    canonical: "/recuperar-senha",
  },
};

export default function RecuperarSenhaPage() {
  return (
    <>
      <Header />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <RecoverPasswordPanel />
      </main>

      <Footer />
    </>
  );
}
