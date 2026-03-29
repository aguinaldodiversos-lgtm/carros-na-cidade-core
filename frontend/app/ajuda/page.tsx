import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Central de ajuda | Carros na Cidade",
  description:
    "Perguntas frequentes sobre o portal, anúncios, conta e uso do Carros na Cidade.",
};

export default function AjudaPage() {
  return (
    <StaticPageLayout
      eyebrow="Ajuda"
      title="Central de ajuda"
      description="Respostas objetivas às dúvidas mais comuns. Se não encontrar o que precisa, fale com a gente pela página de contato."
      sections={[
        {
          title: "O Carros na Cidade vende ou financia carros?",
          body: [
            "Não. Somos um portal de classificados e conteúdo: você encontra anúncios e fala com vendedor ou loja. Compra, vistoria e pagamento são entre as partes, salvo quando uma loja oferece serviço próprio e isso estiver claro no anúncio.",
          ],
        },
        {
          title: "Como entro em contato com quem anuncia?",
          body: [
            "No anúncio aparecem os canais disponibilizados pelo vendedor (telefone, WhatsApp, formulário etc.). Use sempre os dados do próprio anúncio e desconfie de terceiros que apareçam do nada pedindo adiantamento.",
          ],
        },
        {
          title: "Preciso pagar para ver anúncios?",
          body: [
            "Navegar e buscar veículos no site é gratuito para quem está comprando. Quem anuncia segue as regras e planos descritos na área de planos do portal.",
          ],
        },
        {
          title: "Como publico um veículo?",
          body: [
            "Acesse os planos, crie sua conta se ainda não tiver e siga o fluxo de publicação no painel. Os campos obrigatórios existem para manter anúncios claros e compatíveis com a base de cidades do portal.",
          ],
        },
        {
          title: "O portal garante o estado do carro?",
          body: [
            "Não garantimos condições mecânicas ou legais do veículo: quem anuncia é responsável pelas informações. Recomendamos vistoria, checagem de documentos e negociação com calma — veja também nossa página de segurança na negociação.",
          ],
        },
        {
          title: "Como trato dos meus dados pessoais?",
          body: [
            "Respeitamos a LGPD. Você encontra resumo na Política de Privacidade, detalhes sobre direitos na página LGPD e pode solicitar algo específico pelos canais de contato.",
          ],
        },
      ]}
      afterSections={
        <div className="space-y-3 text-[15px] leading-7 text-[#5c6881]">
          <p>
            <Link href="/seguranca" className="font-semibold text-[#0e62d8] hover:underline">
              Segurança e dicas de negociação
            </Link>
            {" · "}
            <Link href="/contato" className="font-semibold text-[#0e62d8] hover:underline">
              Falar com o time
            </Link>
          </p>
        </div>
      }
    />
  );
}
