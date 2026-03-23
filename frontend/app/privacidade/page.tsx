import type { Metadata } from "next";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Política de Privacidade | Carros na Cidade",
  description: "Política de privacidade do portal Carros na Cidade. Como coletamos, usamos e protegemos seus dados pessoais.",
  alternates: { canonical: "/privacidade" },
};

export default function PrivacidadePage() {
  return (
    <StaticPageLayout
      eyebrow="Privacidade"
      title="Política de Privacidade"
      description="A privacidade dos nossos usuários é uma prioridade. Esta política descreve como coletamos, usamos e protegemos as informações pessoais."
      sections={[
        {
          title: "Dados coletados",
          body: [
            "Coletamos nome, e-mail, telefone, CPF ou CNPJ fornecidos no cadastro para verificação de identidade e comunicação.",
            "Dados de navegação como IP, dispositivo e páginas visitadas são coletados para melhoria da plataforma e análise de desempenho.",
          ],
        },
        {
          title: "Uso dos dados",
          body: [
            "Os dados são usados para autenticar usuários, exibir anúncios, processar pagamentos e enviar comunicações relacionadas ao portal.",
            "Não vendemos dados pessoais a terceiros. Dados podem ser compartilhados com processadores de pagamento (ex.: Mercado Pago) para fins transacionais.",
          ],
        },
        {
          title: "Retenção e exclusão",
          body: [
            "Dados de conta são mantidos enquanto a conta estiver ativa. Após exclusão da conta, os dados são removidos em até 30 dias, salvo obrigações legais.",
            "Solicite a exclusão de dados pelo e-mail: privacidade@carrosnacidade.com",
          ],
        },
        {
          title: "Cookies",
          body: [
            "Usamos cookies de sessão para autenticação e cookies analíticos para melhoria contínua. Veja nossa Política de Cookies para mais detalhes.",
          ],
        },
        {
          title: "Seus direitos (LGPD)",
          body: [
            "Você pode solicitar acesso, correção ou exclusão dos seus dados pessoais a qualquer momento.",
            "Para exercer seus direitos, entre em contato em: privacidade@carrosnacidade.com",
          ],
        },
      ]}
    />
  );
}
