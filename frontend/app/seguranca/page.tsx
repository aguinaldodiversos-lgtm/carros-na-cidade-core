import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Segurança na negociação | Carros na Cidade",
  description:
    "Dicas práticas para comprar ou vender veículo com mais segurança e menos risco de golpe.",
};

export default function SegurancaPage() {
  return (
    <StaticPageLayout
      eyebrow="Confiança"
      title="Segurança na negociação"
      description="Negociar carro envolve dinheiro e documento: abaixo estão boas práticas alinhadas ao que o Carros na Cidade é — um lugar para encontrar ofertas e contatos, não um substituto da sua cautela na hora de fechar negócio."
      sections={[
        {
          // Bloco novo (rodada de credibilidade): explicita o que o portal
          // FAZ e o que NÃO FAZ em moderação. Linguagem alinhada ao
          // backend real (antifraude/pending_review/risk_signals em
          // src/modules/ads/risk/) — sem prometer Detran, vistoria ou
          // garantia de procedência.
          title: "O que o Carros na Cidade faz na moderação dos anúncios",
          body: [
            "Anúncios com sinais de risco (preço muito abaixo da FIPE, fotos genéricas, dados inconsistentes, links ou telefones na descrição, contas recém-criadas) podem ir para análise antes de aparecer publicamente.",
            "Anúncios denunciados entram na fila de reavaliação — podem voltar para análise e ser despublicados se confirmarmos o problema.",
            "Anúncios reprovados (ex.: dados que não batem, suspeita de golpe, conteúdo proibido) são removidos do catálogo público.",
            "O que NÃO fazemos: consulta Detran, vistoria física, validação documental completa nem garantia de procedência. Use a checagem do veículo como complemento, não como única fonte de confiança.",
          ],
        },
        {
          title: "Antes de combinar visita ou test-drive",
          body: [
            "Confira se o anúncio faz sentido (preço muito abaixo do mercado, fotos genéricas ou dados incompletos merecem desconfiança).",
            "Prefira lugares públicos e bem iluminados para primeiro encontro; leve alguém com você quando possível.",
          ],
        },
        {
          title: "Documentação e histórico do veículo",
          body: [
            "Exija CRLV, número do chassi conferindo com o veículo, situação de multas e gravames quando aplicável. Em dúvida, busque despachante ou serviço de checagem antes de pagar.",
            "Nunca aceite “só transferir depois” sem contrato claro se não houver confiança plena entre as partes.",
          ],
        },
        {
          title: "Pagamento",
          body: [
            "Evite adiantamento a desconhecidos por PIX ou transferência para “reservar” sem comprovante de identidade alinhado ao vendedor real do anúncio.",
            "Transações em dinheiro devem ser em local seguro; para valores altos, avalie meios rastreáveis e documentação da venda.",
          ],
        },
        {
          title: "Golpes comuns",
          body: [
            "Perfis que pedem pagamento fora do combinado no anúncio, links estranhos para “cadastro”, urgência excessiva (“só hoje”) ou pedido de dados bancários por mensagem são sinais de alerta.",
            "O Carros na Cidade não pede senha de banco nem intermediário de pagamento de veículo por WhatsApp em nome do portal.",
          ],
        },
        {
          title: "Se algo der errado",
          body: [
            "Em caso de crime ou fraude, registre boletim de ocorrência e preserve prints das conversas. Para falhas técnicas do site ou denúncia de anúncio suspeito, use o contato oficial do portal.",
          ],
        },
      ]}
      afterSections={
        <p className="text-[15px] leading-7 text-[#5c6881]">
          <Link href="/ajuda" className="font-semibold text-[#0e62d8] hover:underline">
            Central de ajuda
          </Link>
          {" · "}
          <Link href="/contato" className="font-semibold text-[#0e62d8] hover:underline">
            Contato
          </Link>
          {" · "}
          <Link href="/como-funciona" className="font-semibold text-[#0e62d8] hover:underline">
            Como funciona
          </Link>
        </p>
      }
    />
  );
}
