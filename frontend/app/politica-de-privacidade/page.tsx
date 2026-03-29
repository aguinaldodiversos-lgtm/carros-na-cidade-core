import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";
import { SITE_CONTACT } from "@/lib/site/site-navigation";

export const metadata: Metadata = {
  title: "Política de Privacidade | Carros na Cidade",
  description:
    "Como o Carros na Cidade trata dados pessoais: finalidades, bases e seus direitos em linguagem clara.",
};

export default function PoliticaDePrivacidadePage() {
  return (
    <StaticPageLayout
      eyebrow="Privacidade"
      title="Política de Privacidade"
      description="Esta página resume, em linguagem direta, como tratamos dados no portal. Para detalhes legais completos, você também pode consultar os documentos de Termos de Uso e o material sobre LGPD."
      sections={[
        {
          title: "Quem é o responsável",
          body: [
            "O Carros na Cidade opera a plataforma e define as finalidades do tratamento de dados necessárias para cadastro, publicação de anúncios, navegação e atendimento.",
          ],
        },
        {
          title: "Que dados podemos tratar",
          body: [
            "Dados de cadastro e login (por exemplo nome, e-mail, telefone), informações que você inclui em anúncios e perfis, dados de uso do site (como páginas acessadas e interações) e o que você envia em formulários de contato ou mensagens.",
            "Não pedimos dados além do necessário para cada funcionalidade. O que você publica em anúncio fica visível conforme as regras da plataforma.",
          ],
        },
        {
          title: "Para que usamos",
          body: [
            "Operar o site, autenticar usuários, exibir e gerenciar anúncios, medir desempenho, prevenir fraudes, cumprir obrigações legais e responder solicitações suas.",
            "Comunicações operacionais (como confirmação de cadastro ou avisos importantes sobre a conta) fazem parte do serviço. Marketing, quando existir, seguirá as preferências e a legislação aplicável.",
          ],
        },
        {
          title: "Compartilhamento",
          body: [
            "Podemos envolver prestadores de serviço (hospedagem, e-mail, pagamentos) sob contratos que exigem proteção dos dados. Dados podem ser acessados quando a lei exigir ou para defender direitos em disputas legítimas.",
          ],
        },
        {
          title: "Seus direitos",
          body: [
            "Você pode pedir confirmação sobre tratamentos, acesso, correção, anonimização, portabilidade ou eliminação de dados, conforme a LGPD e o caso concreto.",
            `Solicitações sobre privacidade: use o e-mail ${SITE_CONTACT.email}, identificando-se e descrevendo o pedido.`,
          ],
        },
      ]}
      afterSections={
        <p className="text-[15px] leading-7 text-[#5c6881]">
          <Link href="/lgpd" className="font-semibold text-[#0e62d8] hover:underline">
            LGPD e direitos do titular
          </Link>
          {" · "}
          <Link href="/termos-de-uso" className="font-semibold text-[#0e62d8] hover:underline">
            Termos de uso
          </Link>
        </p>
      }
    />
  );
}
