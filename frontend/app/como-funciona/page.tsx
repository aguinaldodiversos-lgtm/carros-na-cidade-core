import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Como funciona | Carros na Cidade",
  description:
    "Entenda como funciona o Carros na Cidade, um portal de anúncios automotivos que conecta compradores, vendedores e lojas com foco regional.",
};

export default function ComoFuncionaPage() {
  return (
    <StaticPageLayout
      eyebrow="Institucional"
      title="Como funciona"
      description="O Carros na Cidade é um portal de anúncios automotivos criado para aproximar quem procura um veículo de particulares, lojas e outros anunciantes. Você pesquisa, compara e entra em contato diretamente com quem está anunciando."
      sections={[
        {
          title: "Entenda o papel do Carros na Cidade",
          body: [
            "O Carros na Cidade disponibiliza a tecnologia, a organização dos anúncios e as ferramentas que ajudam compradores e anunciantes a se encontrarem.",
            "Não somos proprietários dos veículos anunciados, não compramos ou vendemos veículos em nome dos usuários, não recebemos o pagamento da compra e não participamos da definição das condições finais da negociação entre comprador e vendedor.",
            "Também não cobramos comissão ou percentual sobre o valor da venda do veículo. Eventuais cobranças feitas pelo Carros na Cidade estão relacionadas aos serviços da própria plataforma, como planos de anúncios, destaques ou outras funcionalidades contratadas pelo anunciante.",
          ],
        },
        {
          title: "Para quem está procurando um veículo",
          body: [
            "Você pode navegar pelos anúncios disponíveis, escolher sua cidade e utilizar filtros como marca, modelo, preço e outras características para encontrar veículos compatíveis com o que procura.",
            "Dependendo da pesquisa, da cidade escolhida e da disponibilidade de estoque, o Carros na Cidade também pode apresentar veículos de cidades próximas, ampliando as opções disponíveis sem esconder onde cada veículo está localizado.",
            "Ao encontrar um veículo interessante, consulte as informações do anúncio e utilize os canais disponibilizados pelo próprio anunciante para iniciar o contato.",
          ],
        },
        {
          title: "Como funciona a busca regional",
          body: [
            "O Carros na Cidade foi desenvolvido com foco regional. Isso significa que uma pesquisa pode apresentar veículos da cidade escolhida e também de cidades próximas quando houver opções relevantes para aquela região.",
            "A localização de cada veículo continua identificada no anúncio para que você saiba onde ele está sendo oferecido.",
            "Nosso objetivo é ampliar as opções disponíveis para o comprador sem transformar uma busca regional em um catálogo sem relação com a cidade pesquisada.",
          ],
        },
        {
          title: "Encontrou um veículo que gostou?",
          body: [
            "Antes de fechar negócio, recomendamos que você veja o veículo pessoalmente e confirme todas as informações apresentadas no anúncio.",
            "Fotos, descrição, preço e demais informações são úteis para a pesquisa inicial, mas não substituem uma avaliação presencial.",
            "Sempre que possível, confira a documentação e considere realizar uma vistoria cautelar e uma avaliação mecânica independente antes de efetuar qualquer pagamento.",
            "A publicação de um anúncio no Carros na Cidade não representa certificação, vistoria, garantia de procedência ou recomendação de compra emitida pelo portal.",
          ],
        },
        {
          title: "Como funciona o contato com o vendedor",
          body: [
            "Os canais de contato disponíveis são apresentados no próprio anúncio e podem incluir WhatsApp, telefone ou outras formas disponibilizadas pelo anunciante.",
            "O contato e a negociação acontecem diretamente entre comprador e vendedor.",
            "O Carros na Cidade não define o preço final do veículo, não precisa autorizar a negociação e não participa da definição de entrada, troca, financiamento, entrega ou demais condições acordadas entre as partes.",
            "Se alguém utilizar o nome do Carros na Cidade para solicitar pagamento destinado a reservar, liberar ou garantir um veículo anunciado por terceiros, confirme a informação pelos nossos canais oficiais antes de realizar qualquer transferência.",
          ],
        },
        {
          title: "Como funciona o pagamento do veículo",
          body: [
            "O pagamento da compra do veículo não é feito ao Carros na Cidade.",
            "Não recebemos o dinheiro da compra em nome do vendedor, não mantemos valores em custódia e não funcionamos como conta garantia ou intermediador financeiro da negociação.",
            "Não envie PIX, depósito ou transferência acreditando que o Carros na Cidade ficará responsável por guardar o dinheiro até a entrega do veículo.",
            "Eventuais cobranças realizadas diretamente pelo Carros na Cidade correspondem aos serviços da própria plataforma, como planos, publicação, destaque de anúncios ou outras funcionalidades contratadas pelo anunciante. Essas cobranças não representam comissão sobre a venda do veículo.",
          ],
        },
        {
          title: "O Carros na Cidade financia veículos?",
          body: [
            "O portal pode disponibilizar simuladores, informações ou acesso a serviços relacionados a financiamento, mas o Carros na Cidade não é uma instituição financeira.",
            "Quando houver financiamento, análise de crédito, taxas, parcelas, aprovação e demais condições serão de responsabilidade do banco, instituição financeira, loja ou fornecedor responsável pelo serviço.",
            "O Carros na Cidade não garante aprovação de crédito.",
          ],
        },
        {
          title: "Para quem quer anunciar",
          body: [
            "Particulares e empresas podem anunciar veículos de acordo com os planos, regras e condições disponíveis na plataforma.",
            "Depois de criar sua conta, o anunciante informa os dados do veículo, adiciona fotografias, localização, preço e demais informações necessárias para a publicação.",
            "O anúncio pode aparecer nas páginas de pesquisa e em outras áreas do portal compatíveis com aquele veículo e sua localização.",
          ],
        },
        {
          title: "Quem anuncia é responsável pelas informações publicadas",
          body: [
            "O anunciante deve fornecer informações verdadeiras, atuais e compatíveis com o veículo oferecido.",
            "Isso inclui preço, marca, modelo, versão, ano, quilometragem, equipamentos, estado de conservação, disponibilidade, documentação, fotografias e demais características informadas no anúncio.",
            "O Carros na Cidade pode estabelecer regras de publicação, utilizar mecanismos de moderação e suspender ou remover anúncios que violem suas políticas.",
            "A moderação realizada pela plataforma não equivale a uma inspeção mecânica, cautelar ou documental do veículo.",
          ],
        },
        {
          title: "Para lojas e anunciantes profissionais",
          body: [
            "Lojas e anunciantes profissionais podem utilizar planos e ferramentas específicas para divulgar seus estoques e ampliar sua presença dentro do portal.",
            "Os recursos, limites e benefícios disponíveis são apresentados de acordo com o plano contratado.",
            "A contratação de um plano, destaque ou serviço comercial não significa que o Carros na Cidade passa a ser proprietário, vendedor, representante ou garantidor dos veículos anunciados pela empresa.",
            "A responsabilidade pelas informações da oferta e pela negociação do veículo continua sendo do anunciante.",
          ],
        },
        {
          title: "Como funcionam os planos e destaques",
          body: [
            "O Carros na Cidade pode cobrar pela utilização de determinados serviços da plataforma, como publicação de anúncios, planos destinados a lojistas, destaque de veículos ou outras funcionalidades comerciais.",
            "Esses valores remuneram serviços de tecnologia, divulgação e recursos oferecidos pelo portal.",
            "Não cobramos comissão ou percentual sobre o preço negociado entre comprador e vendedor simplesmente porque um veículo anunciado foi vendido.",
          ],
        },
        {
          title: "O que significa “Abaixo da FIPE”?",
          body: [
            "Alguns anúncios podem ser identificados como Abaixo da FIPE quando o preço informado estiver abaixo do valor de referência utilizado pela plataforma para aquele veículo.",
            "A Tabela FIPE é uma referência de mercado. Essa comparação serve para ajudar na pesquisa, mas não significa que o Carros na Cidade esteja certificando que o veículo seja um bom negócio.",
            "Preço é apenas um dos fatores que devem ser avaliados. Estado de conservação, versão, histórico, documentação, quilometragem e condições da negociação também devem ser verificados.",
          ],
        },
        {
          title: "O que significa “Destaque” ou “Oportunidade”?",
          body: [
            "Essas identificações podem representar recursos comerciais ou critérios utilizados pela plataforma para organizar e dar maior visibilidade a determinados anúncios.",
            "Um anúncio em destaque ou identificado como oportunidade não significa que o Carros na Cidade garante sua qualidade, procedência, condição mecânica ou documentação.",
            "Sempre faça as verificações necessárias antes de concluir uma negociação.",
          ],
        },
        {
          title: "O Carros na Cidade participa da compra e venda?",
          body: [
            "Na utilização normal do portal de anúncios, não. O Carros na Cidade disponibiliza a infraestrutura que permite anunciar, pesquisar, comparar e encontrar veículos.",
            "A eventual compra e venda é realizada diretamente entre as partes envolvidas na negociação.",
            "O portal não define o preço final, não recebe o pagamento do veículo, não realiza a transferência de propriedade e não substitui as verificações que comprador e vendedor devem realizar antes de concluir o negócio.",
          ],
        },
        {
          title: "O Carros na Cidade garante os veículos anunciados?",
          body: [
            "Não oferecemos garantia mecânica ou comercial simplesmente porque o veículo foi anunciado no portal.",
            "A presença de um anúncio no Carros na Cidade não significa que o portal tenha certificado a procedência, documentação, quilometragem, histórico ou estado mecânico do veículo.",
            "Eventual garantia legal ou contratual relacionada ao veículo deve ser verificada diretamente com o vendedor e conforme a legislação aplicável à negociação.",
          ],
        },
        {
          title: "Segurança durante a negociação",
          body: [
            "Comprar ou vender um veículo envolve valores elevados e exige atenção. Veja o veículo pessoalmente, confirme a identidade de quem está negociando, confira a documentação e verifique se os dados correspondem ao anúncio.",
            "Sempre que possível, considere realizar uma vistoria cautelar e uma avaliação mecânica com profissional ou empresa de sua confiança.",
            "Desconfie de preços muito abaixo do mercado, pressão para pagamento imediato, vendedores que se recusam a mostrar o veículo ou pedidos de transferência para terceiros sem uma justificativa clara e verificável.",
            "Nunca realize um pagamento acreditando que o Carros na Cidade está garantindo a operação sem confirmar essa informação diretamente pelos canais oficiais do portal.",
          ],
        },
        {
          title: "Encontrou algo suspeito?",
          body: [
            "Se encontrar um anúncio suspeito, informação aparentemente incorreta ou alguém utilizando indevidamente o nome do Carros na Cidade, entre em contato conosco pelos canais oficiais.",
            "O portal poderá analisar o conteúdo e adotar medidas dentro da plataforma, como solicitar informações adicionais, limitar funcionalidades, suspender ou remover anúncios quando necessário.",
          ],
        },
        {
          title: "Privacidade e proteção de dados",
          body: [
            "Tratamos dados pessoais de acordo com nossa Política de Privacidade e com as regras aplicáveis de proteção de dados.",
            "A página de LGPD apresenta informações sobre os direitos dos titulares e os canais disponíveis para solicitações relacionadas aos seus dados.",
          ],
        },
        {
          title: "O papel do Carros na Cidade, em resumo",
          body: [
            "O Carros na Cidade oferece a plataforma. O anunciante oferece o veículo. O comprador escolhe com quem deseja negociar.",
            "Não somos proprietários dos veículos anunciados, não recebemos comissão sobre o valor da venda, não recebemos o pagamento da compra e não atuamos como intermediadores da negociação entre comprador e vendedor.",
            "Nosso objetivo é facilitar a descoberta de veículos disponíveis na sua cidade e região, organizar as informações dos anúncios e aproximar quem procura de quem está anunciando.",
          ],
        },
      ]}
      afterSections={
        <div className="space-y-6 text-[15px] leading-7 text-[#5c6881]">
          <div className="rounded-2xl border border-[#cfe0f7] bg-[#f4f8ff] p-5 md:p-6">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#0e62d8]">
              Entenda nosso papel
            </p>

            <h2 className="mt-2 text-[20px] font-extrabold tracking-tight text-[#1d2538]">
              Somos um portal de anúncios automotivos
            </h2>

            <div className="mt-3 space-y-3">
              <p>
                O Carros na Cidade conecta compradores e anunciantes. Não somos
                proprietários dos veículos anunciados, não compramos ou vendemos
                veículos em nome dos usuários e não recebemos comissão sobre o
                valor da venda.
              </p>

              <p>
                Também não recebemos o pagamento da compra do veículo e não
                mantemos valores em custódia. A negociação ocorre diretamente
                entre comprador e vendedor.
              </p>

              <p>
                A publicação de um anúncio no portal não representa certificação,
                vistoria, garantia de procedência ou recomendação de compra
                emitida pelo Carros na Cidade.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e4e9f2] bg-white p-5 md:p-6">
            <h2 className="text-[18px] font-extrabold tracking-tight text-[#1d2538]">
              Antes de concluir uma negociação
            </h2>

            <p className="mt-2">
              Veja o veículo pessoalmente, confirme a identidade do vendedor,
              confira a documentação, considere uma vistoria cautelar e avaliação
              mecânica e tenha atenção especial com pedidos de pagamento
              antecipado ou transferências para terceiros.
            </p>
          </div>

          <div>
            <p className="font-semibold text-[#1d2538]">
              Saiba mais sobre o Carros na Cidade
            </p>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              <Link
                href="/ajuda"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Central de ajuda
              </Link>

              <Link
                href="/seguranca"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Segurança na negociação
              </Link>

              <Link
                href="/politica-de-privacidade"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Política de Privacidade
              </Link>

              <Link
                href="/termos-de-uso"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Termos de Uso
              </Link>

              <Link
                href="/contato"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Fale conosco
              </Link>
            </div>
          </div>
        </div>
      }
    />
  );
}
