import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Central de ajuda | Carros na Cidade",
  description:
    "Tire suas dúvidas sobre anúncios, negociação, segurança, publicação de veículos, pagamentos e funcionamento do portal Carros na Cidade.",
};

export default function AjudaPage() {
  return (
    <StaticPageLayout
      eyebrow="Ajuda"
      title="Central de ajuda"
      description="Encontre respostas sobre anúncios, negociação, segurança e funcionamento do Carros na Cidade. Antes de negociar, entenda o papel do portal e os cuidados recomendados para comprar ou vender um veículo."
      sections={[
        {
          title: "Antes de negociar: qual é o papel do Carros na Cidade?",
          body: [
            "O Carros na Cidade é um portal de anúncios automotivos. Nossa função é disponibilizar tecnologia para que pessoas e empresas anunciem veículos e para que interessados encontrem essas ofertas e entrem em contato direto com os anunciantes.",
            "O Carros na Cidade não é proprietário dos veículos anunciados, não compra nem vende os veículos em nome dos usuários, não recebe o valor da compra, não mantém dinheiro em custódia e não participa da definição das condições finais da negociação entre comprador e vendedor.",
            "Também não cobramos comissão ou percentual sobre o valor da venda do veículo. Eventuais cobranças feitas pelo Carros na Cidade referem-se exclusivamente a serviços da plataforma, como planos de anúncios, destaques ou outras funcionalidades contratadas pelo anunciante.",
          ],
        },
        {
          title: "O Carros na Cidade vende carros?",
          body: [
            "Não. Os veículos encontrados no portal são anunciados por lojas, revendedores, concessionárias ou proprietários particulares, conforme identificado em cada anúncio.",
            "O Carros na Cidade funciona como uma plataforma de classificados: ajudamos compradores a encontrar veículos e anunciantes, mas a negociação e a eventual compra são realizadas diretamente entre as partes.",
          ],
        },
        {
          title: "O Carros na Cidade recebe comissão quando um veículo é vendido?",
          body: [
            "Não. O Carros na Cidade não recebe comissão, percentual ou participação sobre o valor negociado entre comprador e vendedor.",
            "Quando houver cobrança pelo uso da plataforma, ela estará relacionada a serviços como publicação, planos comerciais, destaque de anúncios ou outras funcionalidades oferecidas ao anunciante. Essa cobrança não representa participação na compra e venda do veículo.",
          ],
        },
        {
          title: "O pagamento do veículo é feito pelo Carros na Cidade?",
          body: [
            "Não. O Carros na Cidade não recebe o pagamento da compra do veículo em nome do vendedor e não funciona como conta garantia, serviço de custódia ou intermediador do valor da negociação.",
            "Nunca envie dinheiro acreditando que o valor ficará guardado pelo Carros na Cidade até a entrega do veículo.",
            "Se alguém utilizar o nome do portal para pedir PIX, depósito, sinal ou transferência alegando que o Carros na Cidade garantirá a operação, não realize o pagamento e entre em contato conosco pelos canais oficiais e faça a denuncia do anúncio.",
          ],
        },
        {
          title: "O Carros na Cidade financia veículos?",
          body: [
            "Não. O portal oferece apenas um simulador para ajudar o visitante comprador a se planejar com um valor estimado da parcela.",
            "A contratação, análise de crédito, aprovação, taxas, parcelas e demais condições de financiamento são de responsabilidade da instituição financeira, banco, loja ou fornecedor responsável pelo serviço.",
            "O Carros na Cidade não garante aprovação de crédito.",
          ],
        },
        {
          title: "Quem é responsável pelas informações do anúncio?",
          body: [
            "O anunciante é responsável pelas informações que publica e pelo veículo oferecido.",
            "Isso inclui, entre outros dados, preço, ano, versão, quilometragem, características, estado de conservação, disponibilidade, fotos, documentação e demais informações fornecidas no anúncio.",
            "O Carros na Cidade pode estabelecer regras de publicação, realizar moderação e remover anúncios que violem suas políticas, mas isso não significa que o portal tenha realizado vistoria, inspeção ou certificação do veículo.",
          ],
        },
        {
          title: "O Carros na Cidade verifica os veículos antes da publicação?",
          body: [
            "Não realizamos nenhum tipo de vistoria mecânica, cautelar ou documental de nenhum veículo anunciado.",
            "A presença de um veículo no portal não significa que o Carros na Cidade certificou sua procedência, estado mecânico, documentação, quilometragem, histórico ou qualidade.",
            "Antes de concluir uma compra, recomendamos que o interessado veja o veículo pessoalmente, confira a documentação e faça uma avaliação mecânica e/ou cautelar com profissional ou empresa de sua confiança.",
          ],
        },
        {
          title: "O portal garante o estado ou a procedência do veículo?",
          body: [
            "Não. O Carros na Cidade não garante as condições mecânicas, estruturais, documentais ou jurídicas dos veículos anunciados.",
            "É de total responsabilidade do comprador verificar todas as informações diretamente com o vendedor e realizar as consultas, inspeções e verificações que considerar necessárias antes de efetuar qualquer pagamento.",
          ],
        },
        {
          title: "O preço anunciado é garantido pelo Carros na Cidade?",
          body: [
            "Não. O preço e as condições do anúncio são informados pelo anunciante e devem ser confirmados diretamente com ele antes da negociação.",
            "Condições de pagamento, financiamento, entrada, veículo na troca, documentação, validade da oferta e eventuais despesas adicionais devem ser verificadas com o vendedor.",
          ],
        },
        {
          title: "O que significa “Abaixo da FIPE”?",
          body: [
            "Quando um anúncio aparece identificado como abaixo da FIPE, isso significa que, de acordo com os dados disponíveis no portal naquele momento, o preço anunciado está abaixo do valor de referência utilizado para comparação.",
            "A Tabela FIPE é uma referência de mercado. Estar abaixo da FIPE não significa que o Carros na Cidade esteja recomendando, certificando ou garantindo que aquele veículo seja um bom negócio.",
            "Além do preço, avalie estado de conservação, versão, histórico, documentação, quilometragem e condições gerais da negociação.",
          ],
        },
        {
          title: "O que significa “Destaque” ou “Oportunidade”?",
          body: [
            "Essas identificações podem representar recursos comerciais ou critérios utilizados pela plataforma para organizar e destacar determinados anúncios.",
            "Um anúncio em destaque ou identificado como oportunidade não significa que o Carros na Cidade garante a qualidade, procedência, diponibilidade, estado mecânico ou documentação do veículo.",
          ],
        },
        {
          title: "Como entro em contato com quem anuncia?",
          body: [
            "Utilize os canais disponibilizados no próprio anúncio, como telefone, WhatsApp ou outros meios de contato oferecidos pelo vendedor.",
            "Sempre confirme que está falando com o anunciante relacionado ao veículo que você visualizou.",
            "Desconfie de terceiros que apareçam inesperadamente, pressionem por pagamento rápido, solicitem transferência para contas de outras pessoas ou afirmem representar o vendedor sem que isso possa ser confirmado.",
          ],
        },
        {
          title: "Posso negociar diretamente com a loja ou proprietário?",
          body: [
            "Sim. Essa é a finalidade do portal: permitir que o interessado encontre um veículo e entre em contato diretamente com quem está anunciando.",
            "Preço final, entrada, financiamento, veículo na troca, documentação, entrega e demais condições são negociados entre comprador e vendedor.",
          ],
        },
        {
          title: "O Carros na Cidade participa do contrato de compra e venda?",
          body: [
            "Na utilização normal do portal de anúncios, não. O Carros na Cidade não integra o contrato de compra e venda celebrado diretamente entre comprador e vendedor.",
            "O portal disponibiliza a plataforma de anúncios e ferramentas relacionadas aos seus serviços, sem assumir a posição de comprador ou vendedor do veículo anunciado.",
          ],
        },
        {
          title: "Quais cuidados devo tomar antes de comprar um veículo?",
          body: [
            "Veja o veículo pessoalmente antes de concluir a compra. Confirme a identidade do vendedor, verifique a documentação e confira se os dados do veículo correspondem ao que foi anunciado.",
            "Sempre que possível, faça uma vistoria cautelar e uma avaliação mecânica com profissional ou empresa de sua confiança.",
            "Consulte eventuais débitos, restrições, histórico e situação documental antes de efetuar pagamentos ou assinar documentos.",
            "Não tome uma decisão apenas porque o anúncio está publicado no Carros na Cidade.",
          ],
        },
        {
          title: "É seguro pagar um sinal antecipado?",
          body: [
            "Não. Pagamentos antecipados exigem atenção. Evite enviar valores antes de confirmar a identidade do vendedor, a existência do veículo, sua documentação e as condições da negociação.",
            "Desconfie de preços muito abaixo do mercado, pressão para pagamento imediato, vendedores que se recusam a mostrar o veículo ou situações envolvendo supostos intermediários, parentes ou terceiros que não constam no anúncio.",
            "O Carros na Cidade não solicita sinal para reservar veículos anunciados por terceiros.",
          ],
        },
        {
          title: "Alguém pediu pagamento em nome do Carros na Cidade. O que faço?",
          body: [
            "Não realize o pagamento antes de confirmar a legitimidade da cobrança.",
            "Pagamentos eventualmente realizados ao próprio Carros na Cidade correspondem a serviços oferecidos pela plataforma, como planos de anúncios, destaques ou outras funcionalidades contratadas.",
            "O Carros na Cidade não recebe o valor da compra de veículos anunciados por terceiros.",
            "Em caso de dúvida, fale conosco pelos canais oficiais antes de realizar qualquer transferência.",
          ],
        },
        {
          title: "O que faço se encontrar um anúncio suspeito?",
          body: [
            "Entre em contato com nossa equipe ou utilize a funcionalidade de denúncia disponível em cada anúncio.",
            "Informe o máximo possível de dados sobre o anúncio e explique o motivo da suspeita.",
            "O Carros na Cidade poderá analisar o conteúdo e adotar medidas dentro da plataforma, como solicitar informações adicionais, limitar funcionalidades, suspender ou remover o anúncio quando necessário.",
          ],
        },
        {
          title: "Um anúncio pode ser removido?",
          body: [
            "Sim. Anúncios podem ser suspensos ou removidos quando houver indícios de fraude, violação das regras da plataforma, informações incompatíveis, conteúdo inadequado ou outras situações previstas nos Termos de Uso.",
          ],
        },
        {
          title: "O veículo foi vendido, mas o anúncio continua aparecendo. O que faço?",
          body: [
            "O anunciante é responsável por manter a disponibilidade do veículo atualizada. Pode existir um intervalo entre a conclusão da venda e a retirada do anúncio.",
            "Caso identifique um veículo claramente indisponível, você pode informar nossa equipe pelos canais de contato.",
          ],
        },
        {
          title: "Preciso pagar para pesquisar ou visualizar anúncios?",
          body: [
            "Não. Navegar, pesquisar e visualizar os anúncios públicos do Carros na Cidade é gratuito para quem está procurando um veículo.",
            "Anunciantes e lojistas podem ter planos ou serviços comerciais próprios, conforme as condições apresentadas pela plataforma.",
          ],
        },
        {
          title: "Como publico um veículo?",
          body: [
            "Crie sua conta, acesse a área de publicação e siga as etapas para cadastrar o veículo.",
            "Informe dados verdadeiros, atuais e suficientes para que os interessados compreendam corretamente o que está sendo oferecido.",
            "Os anúncios devem respeitar os Termos de Uso e as demais políticas do Carros na Cidade.",
          ],
        },
        {
          title: "Sou lojista. Posso anunciar meu estoque?",
          body: [
            "Sim. O Carros na Cidade possui recursos destinados a lojas e anunciantes profissionais.",
            "Consulte os planos e funcionalidades disponíveis para lojistas. A contratação de um plano comercial não significa que o Carros na Cidade passa a responder pelos veículos anunciados pela loja.",
          ],
        },
        {
          title: "Por que aparecem veículos de cidades próximas?",
          body: [
            "O Carros na Cidade possui uma proposta regional. Dependendo da pesquisa, da cidade escolhida e da disponibilidade de estoque, o portal pode apresentar veículos localizados na cidade pesquisada e também em cidades próximas consideradas relevantes para aquela região.",
            "A localização de cada veículo permanece identificada no anúncio para que o comprador saiba onde ele está sendo oferecido.",
          ],
        },
        {
          title: "Posso confiar apenas nas fotos e informações do anúncio?",
          body: [
            "Não. Jamais conclua uma compra apenas com base nas fotos ou informações publicadas no anúncio.",
            "As imagens ajudam na avaliação inicial, mas não substituem inspeção presencial, análise documental, vistoria cautelar e avaliação mecânica quando necessárias.",
          ],
        },
        {
          title: "O Carros na Cidade oferece garantia dos veículos?",
          body: [
            "Não. O Carros na Cidade não oferece nenhum tipo de garantia simplesmente porque o veículo foi anunciado no portal.",
            "Eventual garantia legal ou contratual relacionada ao veículo deve ser verificada diretamente com o vendedor e de acordo com a legislação aplicável à negociação.",
          ],
        },
        {
          title: "Tive um problema com o vendedor. O Carros na Cidade resolve a negociação?",
          body: [
            "Não. Nossa equipe pode apenas receber a denúncia relacionada ao uso da plataforma e analisar o anúncio ou conta dentro dos limites dos serviços oferecidos pelo portal.",
            "O Carros na Cidade não atua como árbitro da compra e venda, não decide disputas privadas entre comprador e vendedor e não administra a devolução de valores pagos diretamente entre as partes.",
            "Problemas relacionados à negociação devem ser tratados entre os envolvidos e, quando necessário, pelos meios legais adequados.",
          ],
        },
        {
          title: "Como o Carros na Cidade trata meus dados pessoais?",
          body: [
            "Tratamos dados pessoais conforme nossa Política de Privacidade e as regras aplicáveis de proteção de dados.",
            "Informações sobre os direitos dos titulares podem ser consultadas na página de LGPD. Solicitações específicas podem ser encaminhadas pelos canais oficiais de contato.",
          ],
        },
        {
          title: "Onde encontro as regras completas da plataforma?",
          body: [
            "Os Termos de Uso apresentam as regras para utilização do portal e publicação de anúncios.",
            "A Política de Privacidade explica como tratamos dados pessoais.",
            "A página de Segurança reúne orientações importantes para reduzir riscos durante uma negociação.",
            "A página de LGPD apresenta informações sobre direitos relacionados aos seus dados pessoais.",
            "Para outras dúvidas, utilize nossos canais oficiais de contato.",
          ],
        },
      ]}
      afterSections={
        <div className="space-y-6 text-[15px] leading-7 text-[#5c6881]">
          <div className="rounded-2xl border border-[#cfe0f7] bg-[#f4f8ff] p-5 md:p-6">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#0e62d8]">
              Aviso importante
            </p>

            <h2 className="mt-2 text-[20px] font-extrabold tracking-tight text-[#1d2538]">
              O Carros na Cidade é um portal de anúncios
            </h2>

            <div className="mt-3 space-y-3">
              <p>
                O Carros na Cidade conecta compradores e anunciantes. Não somos
                proprietários dos veículos anunciados, não compramos ou vendemos
                os veículos em nome dos usuários, não recebemos comissão sobre o
                valor da venda e não recebemos o pagamento da compra.
              </p>

              <p>
                Os anúncios são publicados por terceiros, que são responsáveis
                pelas informações fornecidas e pelos veículos oferecidos. A
                publicação de um anúncio no portal não representa certificação,
                vistoria, garantia, recomendação de compra ou declaração de
                procedência emitida pelo Carros na Cidade.
              </p>

              <p>
                Antes de concluir qualquer negócio, verifique pessoalmente o
                veículo, a documentação, a identidade do vendedor e todas as
                condições da negociação.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e4e9f2] bg-white p-5 md:p-6">
            <h2 className="text-[18px] font-extrabold tracking-tight text-[#1d2538]">
              Vai comprar um veículo?
            </h2>

            <p className="mt-2">
              Veja o veículo pessoalmente, confirme os dados do anunciante,
              confira a documentação, considere realizar uma vistoria cautelar e
              avaliação mecânica e tenha cuidado com pedidos de pagamento
              antecipado e não transfira valores para terceiros.
            </p>
          </div>

          <div>
            <p className="font-semibold text-[#1d2538]">
              Informações e documentos importantes
            </p>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              <Link
                href="/seguranca"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Segurança e dicas de negociação
              </Link>

              <Link
                href="/termos"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Termos de Uso
              </Link>

              <Link
                href="/politica-de-privacidade"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Política de Privacidade
              </Link><Link
                href="/contato"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Falar com o time
              </Link>
            </div>
          </div>
        </div>
      }
    />
  );
}
