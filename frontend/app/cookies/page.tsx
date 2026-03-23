import type { Metadata } from "next";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Política de Cookies | Carros na Cidade",
  description: "Entenda como e por que usamos cookies no portal Carros na Cidade.",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return (
    <StaticPageLayout
      eyebrow="Cookies"
      title="Política de Cookies"
      description="Utilizamos cookies para garantir o funcionamento correto do portal, melhorar a experiência do usuário e analisar o desempenho das páginas."
      sections={[
        {
          title: "O que são cookies?",
          body: [
            "Cookies são pequenos arquivos de texto armazenados no seu navegador quando você visita um site. Eles permitem que o site reconheça sua sessão e preferências.",
          ],
        },
        {
          title: "Tipos de cookies utilizados",
          body: [
            "Cookies essenciais: necessários para autenticação e funcionamento do portal (ex.: cookie de sessão cnc_session).",
            "Cookies analíticos: usados para entender como usuários navegam e melhorar a plataforma.",
            "Cookies de preferência: salvam configurações como cidade selecionada e filtros de busca.",
          ],
        },
        {
          title: "Gerenciar cookies",
          body: [
            "Você pode bloquear ou excluir cookies pelas configurações do seu navegador. Bloquear cookies essenciais pode impedir o acesso a áreas autenticadas.",
            "Para mais informações sobre controle de cookies, consulte a documentação do seu navegador.",
          ],
        },
      ]}
    />
  );
}
