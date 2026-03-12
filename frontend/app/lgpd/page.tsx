import type { Metadata } from "next";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "LGPD | Carros na Cidade",
  description: "Informações sobre direitos do titular e tratamento de dados no contexto da LGPD.",
};

export default function LgpdPage() {
  return (
    <StaticPageLayout
      eyebrow="Proteção de dados"
      title="LGPD"
      description="O Carros na Cidade respeita os princípios da Lei Geral de Proteção de Dados e mantém processos para atender direitos dos titulares, segurança e finalidade adequada no uso das informações."
      sections={[
        {
          title: "Direitos do titular",
          body: [
            "O titular pode solicitar confirmação de tratamento, acesso, correção, atualização ou exclusão de dados, quando aplicável.",
            "Pedidos relacionados à privacidade podem ser enviados pelos canais oficiais de contato informados nesta plataforma.",
          ],
        },
        {
          title: "Base legal e governança",
          body: [
            "Os dados podem ser tratados com base em execução contratual, legítimo interesse, cumprimento de obrigação legal, consentimento ou proteção de crédito, conforme cada contexto de uso.",
            "Mantemos governança voltada à segurança, rastreabilidade operacional e melhoria contínua de processos ligados à proteção de dados.",
          ],
        },
      ]}
    />
  );
}
