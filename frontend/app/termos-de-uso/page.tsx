import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Termos de Uso | Carros na Cidade",
  description:
    "Condições de uso do portal Carros na Cidade: anúncios, conduta e limites da plataforma.",
};

export default function TermosDeUsoPage() {
  return (
    <StaticPageLayout
      eyebrow="Uso da plataforma"
      title="Termos de Uso"
      description="Ao usar o Carros na Cidade, você concorda com estas regras. Elas existem para manter o ambiente seguro, claro e útil para compradores, vendedores e lojistas."
      sections={[
        {
          title: "O que é o Carros na Cidade",
          body: [
            "É um portal de classificados e conteúdo automotivo: listamos ofertas, damos ferramentas de busca e colocamos anunciantes e interessados em contato. Não somos concessionária nem intermediário financeiro da compra do veículo entre particulares.",
          ],
        },
        {
          title: "Anúncios e conteúdo",
          body: [
            "Quem publica é responsável pela veracidade do veículo, preço, fotos e condições informadas. Anúncios enganosos, ilegais ou que violem direitos de terceiros podem ser removidos ou suspensos.",
            "O portal pode recusar, editar ou tirar do ar conteúdos que prejudiquem usuários, a operação ou o cumprimento da lei.",
          ],
        },
        {
          title: "Conta e conduta",
          body: [
            "Mantenha seus dados de acesso em sigilo. Não use a plataforma para spam, fraude, assédio, coleta indevida de dados de outros usuários ou qualquer uso que comprometa segurança ou estabilidade do serviço.",
          ],
        },
        {
          title: "Limites de responsabilidade",
          body: [
            "Negociação, vistoria, documentação e pagamento do veículo são de responsabilidade das partes, salvo quando outro contrato (por exemplo com lojista parceiro) disser o contrário.",
            "Empregamos cuidado razoável na operação do site, mas não garantimos disponibilidade ininterrupta nem isentamos o usuário de verificar informações críticas antes de fechar negócio.",
          ],
        },
      ]}
      afterSections={
        <p className="text-[15px] leading-7 text-[#5c6881]">
          <Link
            href="/politica-de-privacidade"
            className="font-semibold text-[#0e62d8] hover:underline"
          >
            Política de privacidade
          </Link>
          {" · "}
          <Link href="/lgpd" className="font-semibold text-[#0e62d8] hover:underline">
            LGPD
          </Link>
        </p>
      }
    />
  );
}
