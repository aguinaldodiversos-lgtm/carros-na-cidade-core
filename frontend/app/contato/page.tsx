import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";
import { SITE_CONTACT } from "@/lib/site/site-navigation";

export const metadata: Metadata = {
  title: "Contato | Carros na Cidade",
  description:
    "Fale com o Carros na Cidade: e-mail e telefone comercial para dúvidas sobre anúncios, conta e atendimento.",
};

export default function ContatoPage() {
  return (
    <StaticPageLayout
      eyebrow="Atendimento"
      title="Contato"
      description="Use os canais abaixo para assuntos comerciais, dúvidas sobre anúncios, planos ou parcerias. Para orientações rápidas, a Central de ajuda pode resolver na hora."
      sections={[
        {
          title: "Canais oficiais",
          body: [
            `E-mail: ${SITE_CONTACT.email}`,
            `Telefone / WhatsApp comercial: ${SITE_CONTACT.phoneDisplay}`,
          ],
        },
        {
          title: "Horário e retorno",
          body: [
            "Atendimento em dias úteis, das 9h às 18h (horário de Brasília).",
            "Priorizamos retorno a lojistas e anunciantes com plano ativo; demais solicitações seguem fila por ordem de chegada.",
          ],
        },
        {
          title: "Antes de escrever",
          body: [
            "Inclua nome, cidade e, se for sobre um anúncio, o link ou identificação do veículo. Isso agiliza o suporte.",
            "O portal não media negociação nem pagamento de veículo entre particulares; nesses casos o contato é direto entre comprador e vendedor.",
          ],
        },
      ]}
      afterSections={
        <p className="text-[15px] leading-7 text-[#5c6881]">
          Perguntas frequentes:{" "}
          <Link href="/ajuda" className="font-semibold text-[#0e62d8] hover:underline">
            Central de ajuda
          </Link>
          {" · "}
          <Link href="/seguranca" className="font-semibold text-[#0e62d8] hover:underline">
            Segurança na negociação
          </Link>
        </p>
      }
    />
  );
}
