import type { Metadata } from "next";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Segurança | Carros na Cidade",
  description: "Saiba como o Carros na Cidade protege seus dados, garante autenticidade dos anúncios e orienta sobre boas práticas de segurança nas negociações.",
  alternates: { canonical: "/seguranca" },
};

export default function SegurancaPage() {
  return (
    <StaticPageLayout
      eyebrow="Proteção e boas práticas"
      title="Segurança no Carros na Cidade"
      description="Levamos a segurança dos nossos usuários a sério. Documentos verificados, senhas protegidas e orientações claras para negociações seguras."
      sections={[
        {
          title: "Verificação de documento",
          body: [
            "Todo anunciante cadastrado passa por verificação de CPF ou CNPJ. Isso garante que os dados do vendedor são reais e rastreáveis.",
            "Lojas com CNPJ verificado recebem badge especial e maior credibilidade para compradores.",
          ],
        },
        {
          title: "Senhas e dados protegidos",
          body: [
            "Senhas são armazenadas com hash bcrypt — nunca em texto puro. Dados pessoais são tratados conforme a LGPD.",
            "O acesso ao dashboard e ao painel do lojista é protegido por autenticação JWT com tempo de expiração.",
          ],
        },
        {
          title: "Boas práticas para comprar com segurança",
          body: [
            "Nunca transfira dinheiro antecipadamente sem ver o veículo pessoalmente. Desconfie de vendedores que recusam visita presencial.",
            "Solicite laudo de procedência, verifique multas e financiamento ativo no site do DETRAN ou do banco financiador.",
            "Confira os dados do documento do vendedor e certifique-se que o CPF/CNPJ corresponde ao proprietário no CRLV.",
          ],
        },
        {
          title: "Denúncias e moderação",
          body: [
            "Anúncios suspeitos podem ser denunciados diretamente na página do veículo. Nossa equipe analisa e remove conteúdo indevido em até 24 horas.",
            "Contas com atividade fraudulenta são bloqueadas sem aviso prévio e dados encaminhados quando solicitado por autoridades.",
          ],
        },
        {
          title: "Canal de segurança",
          body: [
            "Para reportar incidentes de segurança ou vulnerabilidades, entre em contato pelo e-mail: seguranca@carrosnacidade.com",
            "Não divulgue vulnerabilidades publicamente antes de nos notificar. Colaboramos com pesquisadores de forma responsável.",
          ],
        },
      ]}
    />
  );
}
