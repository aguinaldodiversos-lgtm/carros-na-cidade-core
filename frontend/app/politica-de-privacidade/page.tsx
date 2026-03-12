import type { Metadata } from "next";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Política de Privacidade | Carros na Cidade",
  description: "Diretrizes de privacidade e tratamento de dados do portal Carros na Cidade.",
};

export default function PoliticaDePrivacidadePage() {
  return (
    <StaticPageLayout
      eyebrow="Privacidade"
      title="Política de Privacidade"
      description="Explicamos aqui, de forma resumida e objetiva, como os dados são tratados no Carros na Cidade para viabilizar atendimento, autenticação, anúncios e comunicações operacionais."
      sections={[
        {
          title: "Dados coletados",
          body: [
            "Podemos tratar informações de cadastro, autenticação, navegação, interesse em anúncios e dados enviados em formulários de contato ou lead.",
            "Esses dados são utilizados para melhorar a experiência, oferecer suporte, ativar funcionalidades e manter a operação do portal.",
          ],
        },
        {
          title: "Compartilhamento e proteção",
          body: [
            "Os dados são compartilhados apenas quando necessário para processar autenticação, pagamentos, contato entre partes interessadas ou cumprimento de obrigações legais.",
            "Adotamos medidas técnicas e organizacionais para reduzir risco de acesso indevido, perda ou uso inadequado de informações.",
          ],
        },
      ]}
    />
  );
}
