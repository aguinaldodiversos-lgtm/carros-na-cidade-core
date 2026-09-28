import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";
import { SITE_CONTACT } from "@/lib/site/site-navigation";

export const metadata: Metadata = {
  title: "Termos de Uso | Carros na Cidade",
  description:
    "Termos de uso do Carros na Cidade: regras para anúncios, contato entre compradores e vendedores, responsabilidades, segurança e uso da plataforma.",
  alternates: {
    canonical: "/termos-de-uso",
  },
};

export default function TermosDeUsoPage() {
  return (
    <StaticPageLayout
      eyebrow="Uso da plataforma"
      title="Termos de Uso"
      description="Estes Termos regulam o uso do Carros na Cidade. Ao acessar a plataforma, criar uma conta, publicar anúncios, contratar serviços ou utilizar os canais de contato disponibilizados nos anúncios, você declara que leu, compreendeu e concorda com estas condições."
      sections={[
        {
          title: "1. Aceitação dos Termos",
          body: [
            "Ao acessar ou utilizar o Carros na Cidade, o usuário declara que leu, compreendeu e concorda com estes Termos de Uso, com a Política de Privacidade e com as demais regras aplicáveis à plataforma.",
            "Caso não concorde com estas condições, o usuário não deve utilizar os serviços que dependam de sua aceitação, incluindo publicação de anúncios, contratação de planos e utilização dos canais destinados ao contato com anunciantes.",
            "A utilização da plataforma não elimina direitos ou obrigações previstos em lei que não possam ser afastados por contrato.",
          ],
        },
        {
          title: "2. O que é o Carros na Cidade",
          body: [
            "O Carros na Cidade é um portal de anúncios automotivos que disponibiliza tecnologia para que pessoas físicas, lojas, revendedores e outros anunciantes publiquem veículos e para que interessados encontrem essas ofertas.",
            "O Carros na Cidade não é proprietário dos veículos anunciados, não compra ou vende veículos em nome dos usuários e, na utilização normal do portal de classificados, não integra o contrato de compra e venda celebrado entre comprador e vendedor.",
            "Nossa atuação consiste em disponibilizar a plataforma, organizar anúncios, oferecer ferramentas de busca, facilitar a descoberta de veículos e disponibilizar meios para que interessados entrem em contato com os anunciantes.",
          ],
        },
        {
          title: "3. Ciência obrigatória ao entrar em contato com um anunciante",
          body: [
            "Ao clicar em botões ou links como “WhatsApp”, “Ligar”, “Falar com o anunciante”, “Entrar em contato”, “Ver telefone” ou qualquer funcionalidade equivalente, o usuário declara ciência de que está deixando o ambiente de pesquisa do portal para iniciar uma comunicação com um terceiro responsável pelo anúncio.",
            "Ao realizar essa ação, o usuário reconhece que o Carros na Cidade não é o vendedor do veículo, não é proprietário do bem, não define as condições finais da oferta, não recebe o pagamento da compra e não participa da conclusão da negociação entre comprador e vendedor.",
            "O usuário reconhece ainda que deve confirmar diretamente com o anunciante todas as informações relevantes antes de assumir qualquer obrigação, realizar pagamentos, entregar outro veículo, assinar documentos ou concluir o negócio.",
            "Essa ciência não exclui responsabilidades legais próprias do Carros na Cidade que, por determinação da legislação aplicável, não possam ser afastadas contratualmente.",
          ],
        },
        {
          title: "4. A negociação é realizada entre comprador e vendedor",
          body: [
            "Preço final, forma de pagamento, financiamento, entrada, veículo oferecido na troca, prazo de entrega, documentação, transferência de propriedade, garantias e demais condições da compra e venda são definidos diretamente entre comprador e vendedor.",
            "O Carros na Cidade não aprova, autoriza ou confirma negociações realizadas entre as partes e não atua como mandatário, representante, corretor ou garantidor da compra e venda do veículo, salvo se algum serviço específico oferecido no futuro estabelecer expressamente condições diferentes.",
            "Ferramentas da plataforma que facilitem contatos, propostas, agendamentos, comparação de veículos ou outras interações não transformam o Carros na Cidade em parte do contrato de compra e venda.",
          ],
        },
        {
          title: "5. Responsabilidade do comprador pelas verificações",
          body: [
            "É responsabilidade do comprador realizar as verificações necessárias antes de concluir qualquer negociação.",
            "O comprador deve conferir, entre outros pontos, a identidade e legitimidade do vendedor, existência do veículo, propriedade, documentação, eventuais débitos, restrições, gravames, histórico, estado de conservação, quilometragem, características, versão, equipamentos e correspondência entre o veículo apresentado e as informações do anúncio.",
            "Recomendamos que o comprador veja o veículo pessoalmente e, sempre que possível, realize vistoria cautelar, consulta documental e avaliação mecânica com profissional ou empresa de sua confiança.",
            "O comprador deve confirmar preço, condições de pagamento, financiamento, troca, entrega, garantia e demais condições diretamente com o vendedor antes de assumir qualquer obrigação.",
          ],
        },
        {
          title: "6. Informações do anúncio devem ser verificadas pelo comprador",
          body: [
            "As informações apresentadas nos anúncios são utilizadas para facilitar a pesquisa e foram fornecidas pelo anunciante ou derivadas de dados relacionados ao veículo.",
            "Antes da compra, é dever do interessado confirmar diretamente com o vendedor as informações que sejam relevantes para sua decisão.",
            "A simples publicação do anúncio no Carros na Cidade não substitui a conferência independente pelo comprador e não representa certificação do veículo pelo portal.",
          ],
        },
        {
          title: "7. Responsabilidade do anunciante",
          body: [
            "O anunciante é responsável pela veracidade, atualidade, legalidade e precisão das informações que publica.",
            "O anunciante deve informar corretamente, conforme aplicável, marca, modelo, versão, ano, quilometragem, preço, localização, estado de conservação, equipamentos, disponibilidade, características e demais condições relevantes do veículo.",
            "O anunciante deve possuir legitimidade para oferecer o veículo ou autorização válida do proprietário para realizar o anúncio.",
            "É dever do anunciante atualizar ou retirar o anúncio quando o veículo deixar de estar disponível ou quando alguma informação relevante se tornar incorreta ou desatualizada.",
          ],
        },
        {
          title: "8. Proibição de anúncios falsos, enganosos ou irregulares",
          body: [
            "Não é permitido publicar anúncio falso, fraudulento, enganoso, abusivo, ilegal ou que possa induzir usuários a erro.",
            "Também é proibido omitir deliberadamente informações relevantes, anunciar veículo inexistente, utilizar fotografias sem autorização, informar preço fictício apenas para atrair contatos, apresentar características que o veículo não possui ou utilizar identidade de terceiros sem autorização.",
            "O anunciante não pode utilizar o portal para golpes, lavagem de dinheiro, fraude documental, comercialização de bens de origem ilícita ou qualquer atividade proibida pela legislação.",
          ],
        },
        {
          title: "9. Moderação, bloqueio e remoção de anúncios",
          body: [
            "O Carros na Cidade poderá utilizar mecanismos automáticos ou manuais de moderação para proteger usuários, a plataforma e o cumprimento de suas regras.",
            "Anúncios que violem estes Termos, apresentem indícios de fraude, contenham informações incompatíveis, infrinjam direitos de terceiros, contrariem a legislação ou representem risco aos usuários poderão ser bloqueados, suspensos ou removidos.",
            "Dependendo da gravidade ou urgência da situação, a suspensão ou remoção poderá ocorrer preventivamente e sem aviso prévio, sem prejuízo de posterior análise ou comunicação ao anunciante quando cabível.",
            "O Carros na Cidade também poderá solicitar documentos, esclarecimentos ou informações adicionais para analisar anúncios ou contas.",
          ],
        },
        {
          title: "10. A publicação não significa aprovação ou certificação do veículo",
          body: [
            "A presença de um anúncio na plataforma não significa que o Carros na Cidade tenha realizado vistoria mecânica, vistoria cautelar, perícia, inspeção documental ou verificação física do veículo.",
            "A publicação também não significa que o portal tenha certificado a propriedade, procedência, quilometragem, histórico, estado de conservação ou regularidade documental do veículo.",
            "O Carros na Cidade poderá realizar controles e verificações relacionados à utilização da plataforma, mas esses procedimentos não substituem as verificações que devem ser realizadas pelas partes interessadas na negociação.",
          ],
        },
        {
          title: "11. Disponibilidade do veículo e condições da oferta",
          body: [
            "A disponibilidade do veículo deve ser confirmada diretamente com o anunciante.",
            "Pode existir intervalo entre a venda, reserva ou indisponibilidade do veículo e a atualização ou retirada do anúncio pelo vendedor.",
            "Preço, forma de pagamento, financiamento, aceitação de veículo na troca, descontos, validade da oferta e demais condições devem ser confirmados antes da conclusão do negócio.",
          ],
        },
        {
          title: "12. O Carros na Cidade não recebe comissão sobre a venda",
          body: [
            "O Carros na Cidade não cobra comissão, percentual ou participação sobre o valor da compra e venda de veículos realizada diretamente entre comprador e vendedor.",
            "O fato de um veículo anunciado ser vendido não gera, por si só, obrigação de pagamento de comissão ao Carros na Cidade.",
            "Eventuais valores cobrados pelo portal referem-se aos serviços da própria plataforma, conforme descrito nos planos, produtos ou funcionalidades contratadas pelo usuário.",
          ],
        },
        {
          title: "13. Pagamentos pela compra do veículo",
          body: [
            "O pagamento do veículo anunciado não deve ser realizado ao Carros na Cidade.",
            "O Carros na Cidade não recebe o valor da compra em nome do vendedor, não funciona como conta garantia, não mantém o dinheiro da negociação em custódia e não garante a entrega do veículo em razão de pagamento realizado entre terceiros.",
            "Se alguém utilizar o nome do Carros na Cidade para pedir PIX, depósito, transferência ou sinal alegando que o portal ficará responsável pelo dinheiro da compra, o usuário deve interromper a operação e confirmar a informação pelos canais oficiais.",
          ],
        },
        {
          title: "14. Planos, destaques e serviços pagos do portal",
          body: [
            "O Carros na Cidade poderá oferecer serviços pagos relacionados à utilização da plataforma, incluindo planos de anúncios, assinaturas, destaques, maior exposição ou funcionalidades adicionais.",
            "Esses pagamentos remuneram serviços de tecnologia, publicidade e utilização da plataforma e não constituem comissão sobre o valor de venda do veículo.",
            "Preços, duração, limites, renovação, cancelamento e demais condições de cada serviço serão apresentados antes da contratação ou nos documentos específicos aplicáveis.",
          ],
        },
        {
          title: "15. Financiamento e serviços de terceiros",
          body: [
            "O Carros na Cidade não é instituição financeira e não garante aprovação de financiamento.",
            "Simulações apresentadas na plataforma possuem caráter informativo e podem não representar as condições finais oferecidas por bancos, financeiras, lojas ou demais fornecedores.",
            "Quando o usuário contratar financiamento, seguro, vistoria, pagamento ou outro serviço de terceiro, a relação contratual correspondente será regida pelas condições do fornecedor responsável pelo serviço.",
          ],
        },
        {
          title: "16. Tabela FIPE e informações de mercado",
          body: [
            "Valores relacionados à Tabela FIPE são utilizados como referência e podem variar conforme atualização da fonte, versão, ano, combustível, configuração e demais características do veículo.",
            "Comparações como “Abaixo da FIPE” não representam avaliação mecânica, recomendação de compra ou garantia de que determinado veículo seja financeiramente vantajoso.",
            "O comprador deve considerar o conjunto das informações do veículo e realizar suas próprias verificações antes de decidir pela compra.",
          ],
        },
        {
          title: "17. Destaques e classificações como “Oportunidade”",
          body: [
            "O portal poderá utilizar identificadores, badges, classificações ou mecanismos de destaque para organizar os anúncios ou dar visibilidade a determinadas ofertas.",
            "Um anúncio identificado como Destaque, Oportunidade, Abaixo da FIPE ou outra classificação não representa certificação do veículo, garantia de procedência ou promessa de que aquela oferta seja adequada às necessidades do comprador.",
          ],
        },
        {
          title: "18. Segurança e prevenção a fraudes",
          body: [
            "Os usuários devem agir com cautela durante qualquer negociação iniciada a partir da plataforma.",
            "Desconfie de ofertas incompatíveis com o mercado, pressão para pagamento imediato, pedidos para transferir valores a terceiros, vendedores que se recusam a apresentar o veículo, documentos inconsistentes ou histórias envolvendo supostos intermediários que não possam ser confirmados.",
            "Sempre que houver suspeita de fraude ou utilização indevida do portal, o usuário deve interromper a negociação e comunicar o fato pelos canais oficiais do Carros na Cidade.",
          ],
        },
        {
          title: "19. Cadastro, conta e capacidade do usuário",
          body: [
            "Para utilizar funcionalidades que exijam cadastro, o usuário deve fornecer dados verdadeiros, atuais e completos.",
            "A conta deve ser utilizada por pessoa legalmente capaz de praticar os atos correspondentes ou por representante devidamente autorizado.",
            "O usuário é responsável por manter suas credenciais de acesso em sigilo e deve comunicar o portal caso identifique uso não autorizado de sua conta.",
          ],
        },
        {
          title: "20. Uso permitido da plataforma",
          body: [
            "O Carros na Cidade deve ser utilizado para finalidades lícitas e compatíveis com os serviços oferecidos.",
            "É proibido utilizar a plataforma para fraude, spam, assédio, falsidade ideológica, invasão, tentativa de acesso indevido, disseminação de malware, exploração de vulnerabilidades ou qualquer conduta que comprometa a segurança ou disponibilidade do serviço.",
            "Também é proibida a extração automatizada não autorizada de dados, raspagem massiva, cópia sistemática de anúncios, engenharia reversa ou utilização abusiva dos recursos da plataforma.",
          ],
        },
        {
          title: "21. Fotografias, textos e demais conteúdos publicados pelo anunciante",
          body: [
            "O anunciante declara possuir os direitos ou autorizações necessários sobre fotografias, textos, logotipos, marcas e demais conteúdos enviados à plataforma.",
            "Ao publicar conteúdo no Carros na Cidade, o anunciante autoriza sua hospedagem, processamento, adaptação técnica e exibição na plataforma, em mecanismos de busca, páginas de compartilhamento e materiais destinados à divulgação do próprio anúncio ou dos serviços do portal, durante o período necessário à finalidade da publicação.",
            "Essa autorização não transfere ao Carros na Cidade a propriedade intelectual do conteúdo originalmente pertencente ao anunciante ou a terceiros.",
          ],
        },
        {
          title: "22. Direitos de propriedade intelectual do portal",
          body: [
            "Marcas, identidade visual, software, código, textos institucionais, layouts, bancos de dados, sistemas, funcionalidades e demais elementos próprios do Carros na Cidade são protegidos pela legislação aplicável.",
            "O acesso à plataforma não concede ao usuário licença para copiar, reproduzir, distribuir, explorar comercialmente ou utilizar esses elementos fora das finalidades autorizadas.",
          ],
        },
        {
          title: "23. Serviços, sites e aplicativos de terceiros",
          body: [
            "A plataforma pode conter links ou integrações com WhatsApp, instituições financeiras, meios de pagamento, mapas, redes sociais, serviços de análise, empresas de vistoria e outros fornecedores.",
            "Quando o usuário acessa serviço externo, passam a ser aplicáveis também as regras, políticas e condições do respectivo terceiro.",
            "O Carros na Cidade não controla a operação independente de serviços externos e não assume obrigações contratuais que pertençam exclusivamente ao fornecedor terceiro.",
          ],
        },
        {
          title: "24. Privacidade e proteção de dados pessoais",
          body: [
            "O tratamento de dados pessoais pelo Carros na Cidade é realizado de acordo com a Política de Privacidade, a página de LGPD e a legislação aplicável.",
            "O usuário deve consultar esses documentos para compreender quais dados são tratados, suas finalidades, direitos dos titulares e canais disponíveis para solicitações.",
          ],
        },
        {
          title: "25. Disponibilidade e funcionamento da plataforma",
          body: [
            "O Carros na Cidade busca manter seus serviços disponíveis e seguros, mas funcionalidades podem ser temporariamente interrompidas por manutenção, atualização, falhas técnicas, indisponibilidade de fornecedores, problemas de telecomunicações, eventos de força maior ou outras situações operacionais.",
            "Não garantimos que todas as funcionalidades estarão disponíveis de maneira ininterrupta ou livre de falhas em todos os momentos.",
            "Quando possível, adotaremos medidas razoáveis para restaurar o funcionamento dos serviços afetados.",
          ],
        },
        {
          title: "26. Limites de responsabilidade relacionados à compra e venda",
          body: [
            "Como regra, o Carros na Cidade não responde pelo cumprimento das obrigações assumidas diretamente entre comprador e vendedor, incluindo entrega do veículo, pagamento, transferência, qualidade, vícios, garantias ou demais condições particulares da compra e venda.",
            "Também não assumimos a posição do anunciante em relação à veracidade das declarações feitas por ele sobre o veículo.",
            "Essas limitações devem ser interpretadas de acordo com a legislação aplicável e não excluem responsabilidades próprias do Carros na Cidade que não possam ser afastadas por contrato.",
          ],
        },
        {
          title: "27. Responsabilidade do usuário pelo uso indevido",
          body: [
            "O usuário que utilizar a plataforma de forma ilícita, fraudulenta ou em violação destes Termos poderá responder pelos danos e consequências decorrentes de sua própria conduta, nos termos da legislação aplicável.",
            "O Carros na Cidade poderá preservar registros, restringir funcionalidades e colaborar com autoridades competentes quando houver obrigação legal ou requisição válida.",
          ],
        },
        {
          title: "28. Denúncias, reclamações e comunicações",
          body: [
            "Usuários podem comunicar anúncios suspeitos, conteúdo irregular, fraude, uso indevido de dados, violação de direitos ou outras situações relevantes pelos canais oficiais da plataforma.",
            "As comunicações serão analisadas de acordo com sua natureza, gravidade, informações disponíveis e obrigações legais aplicáveis.",
            "Sempre que possível, forneça URL do anúncio, descrição do problema e elementos que permitam compreender a ocorrência.",
          ],
        },
        {
          title: "29. Suspensão ou encerramento de contas",
          body: [
            "O Carros na Cidade poderá limitar, suspender ou encerrar contas que violem estes Termos, pratiquem fraude, coloquem outros usuários em risco, prejudiquem a operação do portal ou utilizem a plataforma de forma incompatível com sua finalidade.",
            "Medidas preventivas poderão ser adotadas imediatamente quando necessárias à segurança da plataforma ou dos usuários.",
          ],
        },
        {
          title: "30. Alterações destes Termos",
          body: [
            "Estes Termos poderão ser atualizados para refletir mudanças legais, regulatórias, técnicas, operacionais ou relacionadas aos serviços oferecidos pelo Carros na Cidade.",
            "Quando uma alteração for relevante, o portal poderá comunicar os usuários pelos meios adequados e apresentar a nova versão antes de exigir nova aceitação, quando isso for necessário.",
            "A versão e a data de atualização ajudam a identificar quais condições estavam vigentes em determinado momento.",
          ],
        },
        {
          title: "31. Legislação aplicável",
          body: [
            "Estes Termos são regidos pela legislação da República Federativa do Brasil, incluindo as normas de proteção do consumidor, proteção de dados pessoais, contratos, comércio eletrônico e serviços digitais aplicáveis ao caso concreto.",
            "Nenhuma disposição destes Termos deve ser interpretada como renúncia a direito que a legislação considere irrenunciável.",
          ],
        },
        {
          title: "32. Solução de dúvidas e controvérsias",
          body: [
            "Em caso de dúvida ou reclamação relacionada à plataforma, recomendamos que o usuário procure inicialmente os canais oficiais do Carros na Cidade para que a situação possa ser analisada.",
            "Eventuais controvérsias que não possam ser solucionadas diretamente serão submetidas aos meios e órgãos competentes previstos na legislação aplicável, preservados os direitos dos consumidores quanto ao foro competente quando cabível.",
          ],
        },
        {
          title: "33. Contato",
          body: [
            `Dúvidas, denúncias e solicitações relacionadas a estes Termos podem ser encaminhadas pelos canais oficiais do portal ou pelo e-mail ${SITE_CONTACT.email}.`,
            "Para assuntos relacionados a dados pessoais, consulte também a Política de Privacidade e a página de LGPD.",
          ],
        },
      ]}
      afterSections={
        <div className="space-y-6 text-[15px] leading-7 text-[#5c6881]">
          <div className="rounded-2xl border border-[#cfe0f7] bg-[#f4f8ff] p-5 md:p-6">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#0e62d8]">
              Atenção antes de entrar em contato
            </p>

            <h2 className="mt-2 text-[20px] font-extrabold tracking-tight text-[#1d2538]">
              O Carros na Cidade é um portal de anúncios
            </h2>

            <div className="mt-3 space-y-3">
              <p>
                Ao utilizar WhatsApp, telefone ou qualquer outro canal para falar
                com um anunciante, você declara ciência de que o Carros na Cidade
                não é o vendedor, não é proprietário do veículo, não recebe o
                pagamento da compra e não participa da conclusão da negociação.
              </p>

              <p>
                É responsabilidade do comprador confirmar a identidade do
                vendedor, verificar o veículo, conferir documentos, histórico,
                condições, preço e demais informações antes de realizar qualquer
                pagamento ou concluir o negócio.
              </p>

              <p>
                O anunciante é responsável pela veracidade e atualização das
                informações publicadas. Anúncios que violem nossas regras poderão
                ser suspensos, bloqueados ou removidos.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e4e9f2] bg-white p-5 md:p-6">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#0e62d8]">
              Comissão e pagamento
            </p>

            <h2 className="mt-2 text-[18px] font-extrabold tracking-tight text-[#1d2538]">
              Não cobramos comissão sobre a venda do veículo
            </h2>

            <p className="mt-2">
              O Carros na Cidade não recebe percentual sobre o preço negociado
              entre comprador e vendedor e não recebe o valor da compra do
              veículo. Valores eventualmente pagos ao portal correspondem aos
              serviços da própria plataforma, como planos, assinaturas ou
              destaques.
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4e9f2] bg-white p-5 md:p-6">
            <h2 className="text-[18px] font-extrabold tracking-tight text-[#1d2538]">
              Antes de comprar
            </h2>

            <p className="mt-2">
              Veja o veículo pessoalmente, confirme a identidade de quem está
              vendendo, confira a documentação e considere realizar vistoria
              cautelar e avaliação mecânica independente. Não faça pagamentos
              antecipados sem compreender e verificar completamente a negociação.
            </p>
          </div>

          <div>
            <p className="font-semibold text-[#1d2538]">
              Documentos e informações relacionadas
            </p>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              <Link
                href="/seguranca"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Segurança na negociação
              </Link>

              <Link
                href="/ajuda"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Central de ajuda
              </Link>

              <Link
                href="/como-funciona"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Como funciona
              </Link>

              <Link
                href="/politica-de-privacidade"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Política de Privacidade
              </Link>

              <Link
                href="/lgpd"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                LGPD
              </Link>

              <Link
                href="/contato"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Contato
              </Link>
            </div>
          </div>

          <p className="text-[13px] leading-6 text-[#7a8499]">
            Última atualização: 27 de setembro de 2026.
          </p>
        </div>
      }
    />
  );
}
