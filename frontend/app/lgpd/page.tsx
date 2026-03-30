import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";
import { SITE_CONTACT } from "@/lib/site/site-navigation";

export const metadata: Metadata = {
  title: "LGPD | Carros na Cidade",
  description:
    "Direitos do titular de dados e compromisso do Carros na Cidade com a Lei Geral de Proteção de Dados.",
};

export default function LgpdPage() {
  return (
    <StaticPageLayout
      eyebrow="Proteção de dados"
      title="LGPD no Carros na Cidade"
      description="A Lei Geral de Proteção de Dados (Lei nº 13.709/2018) garante direitos a quem tem dados tratados por empresas e órgãos. No Carros na Cidade, levamos isso a sério na operação do portal e no atendimento a solicitações legítimas."
      sections={[
        {
          title: "Direitos que você pode exercer",
          body: [
            "Confirmação de que tratamos seus dados, acesso aos dados, correção de dados incompletos ou incorretos, anonimização, bloqueio ou eliminação quando aplicável, portabilidade e informação sobre compartilhamentos.",
            "O atendimento depende de comprovar sua identidade e da análise de cada pedido — em alguns casos a lei permite ou exige manter dados (por exemplo por obrigação legal ou defesa de direito).",
          ],
        },
        {
          title: "Como solicitar",
          body: [
            `Envie um e-mail para ${SITE_CONTACT.email} com assunto claro (ex.: “LGPD — solicitação de titular”), seu nome completo e descrição do que precisa. Responderemos no prazo razoável previsto na legislação.`,
          ],
        },
        {
          title: "Base legal e segurança",
          body: [
            "Tratamos dados conforme as bases previstas na LGPD (execução de contrato, cumprimento de obrigação legal, legítimo interesse, consentimento quando exigido, entre outras, conforme cada hipótese).",
            "Adotamos medidas técnicas e organizacionais compatíveis com o risco, em evolução contínua.",
          ],
        },
      ]}
      afterSections={
        <p className="text-[15px] leading-7 text-[#5c6881]">
          Leia também a{" "}
          <Link
            href="/politica-de-privacidade"
            className="font-semibold text-[#0e62d8] hover:underline"
          >
            Política de Privacidade
          </Link>
          {" e os "}
          <Link href="/termos-de-uso" className="font-semibold text-[#0e62d8] hover:underline">
            Termos de uso
          </Link>
          .
        </p>
      }
    />
  );
}
