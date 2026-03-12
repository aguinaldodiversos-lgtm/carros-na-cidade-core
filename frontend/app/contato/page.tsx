import type { Metadata } from "next";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Contato | Carros na Cidade",
  description: "Canais de atendimento e contato institucional do portal Carros na Cidade.",
};

export default function ContatoPage() {
  return (
    <StaticPageLayout
      eyebrow="Atendimento"
      title="Contato"
      description="Entre em contato com o time do Carros na Cidade para suporte comercial, dúvidas sobre anúncios, parcerias e atendimento institucional."
      sections={[
        {
          title: "Canais de atendimento",
          body: [
            "E-mail: contato@carrosnacidade.com",
            "Telefone e WhatsApp comercial: (11) 98768-4221",
          ],
        },
        {
          title: "Horário de suporte",
          body: [
            "Nosso atendimento comercial e operacional funciona em dias úteis, das 9h às 18h, com retorno prioritário para lojistas e anunciantes ativos.",
          ],
        },
      ]}
    />
  );
}
