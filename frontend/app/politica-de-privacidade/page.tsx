import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";
import { SITE_CONTACT } from "@/lib/site/site-navigation";

export const metadata: Metadata = {
  title: "Política de Privacidade | Carros na Cidade",
  description:
    "Saiba como o Carros na Cidade coleta, utiliza, protege, armazena e compartilha dados pessoais e conheça seus direitos conforme a LGPD.",
  alternates: {
    canonical: "/politica-de-privacidade",
  },
};

export default function PoliticaDePrivacidadePage() {
  return (
    <StaticPageLayout
      eyebrow="Privacidade"
      title="Política de Privacidade"
      description="Esta Política explica, de forma clara, como o Carros na Cidade trata dados pessoais durante a navegação, criação de conta, publicação de anúncios, contratação de serviços, uso das ferramentas da plataforma e atendimento aos usuários."
      sections={[
        {
          title: "1. Sobre esta Política",
          body: [
            "Esta Política de Privacidade aplica-se ao tratamento de dados pessoais realizado pelo Carros na Cidade por meio do site, áreas autenticadas, painéis de usuários e lojistas, formulários, ferramentas, serviços, funcionalidades e canais oficiais relacionados à plataforma.",
            "Ao utilizar o Carros na Cidade, o usuário poderá ter seus dados tratados conforme as finalidades, bases legais e condições descritas nesta Política.",
            "Esta Política deve ser lida em conjunto com os Termos de Uso, a página de LGPD, as orientações de segurança e demais regras específicas apresentadas durante a utilização de determinadas funcionalidades.",
          ],
        },
        {
          title: "2. Quem é responsável pelo tratamento dos dados",
          body: [
            "Para as atividades em que define as finalidades e os meios essenciais de tratamento de dados pessoais, o responsável pela operação do Carros na Cidade atua como controlador dos dados pessoais.",
            "Prestadores contratados para executar atividades em nome do Carros na Cidade, como infraestrutura tecnológica, hospedagem, armazenamento, envio de comunicações, processamento de pagamentos ou suporte técnico, poderão atuar como operadores ou agentes independentes, conforme a natureza de cada serviço.",
            `Dúvidas ou solicitações sobre privacidade podem ser encaminhadas para ${SITE_CONTACT.email}.`,
          ],
        },
        {
          title: "3. Quais dados pessoais podemos tratar",
          body: [
            "Os dados tratados dependem das funcionalidades utilizadas pelo usuário e podem incluir nome, e-mail, telefone, cidade, informações de cadastro, dados de autenticação e informações necessárias à identificação da conta.",
            "Quando necessário para determinadas funcionalidades, também poderão ser tratados dados relacionados a CPF, CNPJ, tipo de conta, validação documental e informações necessárias à verificação ou elegibilidade do usuário.",
            "Também tratamos as informações que o próprio usuário fornece em anúncios, cadastros de lojas, formulários, solicitações, atendimentos, denúncias, propostas ou demais interações realizadas na plataforma.",
            "Não coletamos indiscriminadamente todos esses dados de todos os usuários. O conjunto efetivamente tratado depende da relação do usuário com a plataforma e dos recursos que ele utiliza.",
          ],
        },
        {
          title: "4. Dados fornecidos na criação e utilização da conta",
          body: [
            "Ao criar uma conta, poderemos solicitar dados necessários para identificação, autenticação, segurança e utilização das funcionalidades disponíveis para aquele tipo de usuário.",
            "O usuário é responsável por fornecer informações verdadeiras, exatas e atualizadas e deve manter seus dados cadastrais corretos durante o uso da plataforma.",
            "Credenciais de acesso são destinadas ao uso do próprio titular da conta e devem ser mantidas em sigilo.",
          ],
        },
        {
          title: "5. Dados relacionados aos anúncios",
          body: [
            "Ao publicar um veículo, o anunciante fornece informações relacionadas ao anúncio, como características do veículo, preço, localização, fotografias e dados necessários para permitir que potenciais compradores entrem em contato.",
            "Determinadas informações inseridas pelo anunciante são destinadas à publicação e, portanto, poderão ficar visíveis para qualquer visitante do portal, inclusive pessoas que não possuam uma conta.",
            "O anunciante deve evitar inserir em campos públicos informações pessoais desnecessárias, documentos, dados bancários, senhas ou qualquer informação que não seja necessária para apresentar o veículo.",
          ],
        },
        {
          title: "6. Dados públicos de lojas e anunciantes profissionais",
          body: [
            "Lojas e anunciantes profissionais podem possuir páginas públicas com informações comerciais necessárias à apresentação do estabelecimento, de seu estoque e de seus canais de contato.",
            "Dados fornecidos especificamente para divulgação comercial poderão ser exibidos publicamente conforme a finalidade da funcionalidade utilizada.",
            "Informações internas de conta, autenticação, segurança ou administração não são publicadas apenas pelo fato de o usuário possuir uma página pública.",
          ],
        },
        {
          title: "7. Dados coletados durante a navegação",
          body: [
            "Durante o acesso ao portal, podemos tratar informações técnicas e registros necessários à operação, segurança, diagnóstico e melhoria do serviço.",
            "Essas informações podem incluir endereço IP, data e horário de acesso, tipo de navegador, sistema operacional, informações do dispositivo, páginas visitadas, origem da navegação, interações realizadas, identificadores técnicos, registros de erros e eventos relacionados ao uso da plataforma.",
            "Esses dados podem ser utilizados para funcionamento técnico, análise de desempenho, prevenção de abuso, investigação de incidentes, segurança e produção de métricas sobre o uso do portal.",
          ],
        },
        {
          title: "8. Cookies e tecnologias semelhantes",
          body: [
            "O Carros na Cidade pode utilizar cookies e tecnologias semelhantes para manter sessões, autenticar usuários, preservar preferências, reforçar a segurança, compreender o funcionamento da plataforma e produzir métricas de utilização.",
            "Cookies estritamente necessários podem ser utilizados para funcionalidades essenciais do serviço.",
            "Caso sejam utilizadas tecnologias não essenciais para publicidade, marketing ou finalidades semelhantes, elas serão tratadas de acordo com a legislação aplicável e com os mecanismos de escolha disponibilizados ao usuário quando necessários.",
            "A desativação de determinados cookies pelo navegador pode afetar o funcionamento de recursos que dependem deles.",
          ],
        },
        {
          title: "9. Para quais finalidades utilizamos os dados",
          body: [
            "Podemos tratar dados pessoais para criar e administrar contas; autenticar usuários; permitir publicação e gerenciamento de anúncios; apresentar veículos e lojas; disponibilizar funcionalidades; permitir contatos iniciados pelos próprios usuários; processar solicitações e oferecer suporte.",
            "Também podemos utilizar dados para manter a segurança da plataforma, detectar comportamentos suspeitos, prevenir fraudes e abusos, investigar incidentes, aplicar nossas regras, moderar anúncios e proteger usuários e o próprio serviço.",
            "Dados também podem ser tratados para gerar métricas, avaliar desempenho, corrigir erros, desenvolver recursos, melhorar a experiência de uso e compreender como as funcionalidades são utilizadas.",
            "Quando necessário, também utilizamos dados para cumprir obrigações legais ou regulatórias, responder a autoridades competentes, exercer direitos e preservar provas relacionadas a reclamações, processos ou disputas.",
          ],
        },
        {
          title: "10. Bases legais utilizadas",
          body: [
            "O tratamento de dados pessoais não depende de uma única base legal. A base adequada varia conforme a finalidade e as circunstâncias do tratamento.",
            "Conforme o caso, o tratamento poderá ocorrer para execução de contrato ou de procedimentos preliminares relacionados ao serviço solicitado pelo titular, cumprimento de obrigação legal ou regulatória, exercício regular de direitos, atendimento a interesses legítimos do Carros na Cidade ou de terceiros quando legalmente permitido, ou mediante consentimento quando essa for a base adequada.",
            "Quando determinado tratamento depender de consentimento, o usuário receberá informações apropriadas e poderá exercer os direitos relacionados a essa manifestação conforme a legislação aplicável.",
          ],
        },
        {
          title: "11. Contato entre comprador e anunciante",
          body: [
            "Quando um usuário decide entrar em contato com um anunciante por WhatsApp, telefone ou outro canal disponibilizado no anúncio, determinadas informações podem passar a ser tratadas diretamente pelo anunciante e pelo serviço externo utilizado para aquela comunicação.",
            "A partir desse contato externo, o tratamento realizado pelo anunciante ou por terceiros não ocorre necessariamente sob controle do Carros na Cidade.",
            "Recomendamos que usuários não forneçam documentos, dados bancários, senhas ou outras informações sensíveis sem compreender a finalidade e a identidade de quem está recebendo esses dados.",
          ],
        },
        {
          title: "12. Pagamentos feitos à plataforma",
          body: [
            "Quando o usuário contrata um plano, destaque, assinatura ou outro serviço pago do próprio Carros na Cidade, dados necessários ao processamento da cobrança poderão ser compartilhados com o prestador responsável pelo pagamento.",
            "O Carros na Cidade procura limitar o tratamento de informações financeiras ao necessário para identificar a operação, acompanhar seu status, prevenir fraude, prestar suporte e cumprir obrigações legais.",
            "Dados de cartão ou outras credenciais financeiras podem ser processados diretamente pelo prestador de pagamentos conforme os serviços utilizados, sem necessidade de armazenamento integral desses dados pelo Carros na Cidade.",
            "Esses pagamentos referem-se aos serviços da plataforma e não ao pagamento da compra dos veículos anunciados.",
          ],
        },
        {
          title: "13. Compartilhamento de dados pessoais",
          body: [
            "O Carros na Cidade não disponibiliza dados pessoais indiscriminadamente a terceiros.",
            "Dados poderão ser compartilhados, na medida necessária, com fornecedores de infraestrutura, hospedagem, armazenamento, segurança, envio de comunicações, processamento de pagamentos, monitoramento, análise técnica, suporte e outros serviços necessários à operação da plataforma.",
            "Também poderá haver compartilhamento quando necessário para cumprir obrigação legal, ordem judicial, determinação de autoridade competente, prevenir ou investigar fraude, proteger direitos ou segurança, ou exercer direitos em processos administrativos, judiciais ou arbitrais.",
            "Em operações societárias legítimas, como reorganização, incorporação, aquisição ou transferência de ativos relacionados ao serviço, dados poderão ser transferidos observadas as exigências legais aplicáveis.",
          ],
        },
        {
          title: "14. Não comercializamos dados pessoais como mercadoria",
          body: [
            "O modelo de negócio do Carros na Cidade está relacionado à oferta de serviços da plataforma, publicidade de veículos, planos, destaques e funcionalidades destinadas aos usuários.",
            "Não comercializamos cadastros pessoais simplesmente para que terceiros utilizem esses dados de maneira desvinculada das finalidades descritas nesta Política.",
            "Compartilhamentos necessários à prestação dos serviços não devem ser confundidos com venda indiscriminada de bases de dados pessoais.",
          ],
        },
        {
          title: "15. Prestadores de serviço",
          body: [
            "Podemos contratar empresas especializadas para fornecer infraestrutura tecnológica, armazenamento de arquivos e imagens, hospedagem, processamento de pagamentos, comunicações, segurança, análise técnica e outros serviços necessários ao funcionamento do portal.",
            "Buscamos trabalhar com prestadores adequados às atividades realizadas e limitar o acesso aos dados às finalidades necessárias à prestação do serviço contratado.",
            "Cada prestador pode possuir responsabilidades próprias quando atuar como controlador independente de determinados tratamentos.",
          ],
        },
        {
          title: "16. Transferência internacional de dados",
          body: [
            "Alguns fornecedores tecnológicos podem possuir infraestrutura, servidores, empresas do mesmo grupo ou subcontratados localizados fora do Brasil.",
            "Quando uma operação caracterizar transferência internacional de dados pessoais, o Carros na Cidade buscará observar os requisitos previstos na LGPD e na regulamentação aplicável.",
            "A localização física de infraestrutura no exterior não altera o compromisso de aplicar medidas apropriadas de proteção aos dados tratados sob responsabilidade do portal.",
          ],
        },
        {
          title: "17. Informações públicas e mecanismos de busca",
          body: [
            "Informações que fazem parte de páginas públicas, como determinados dados de anúncios ou páginas de lojas, podem ser acessadas por visitantes e eventualmente indexadas por mecanismos de busca.",
            "A retirada de uma informação do Carros na Cidade não significa necessariamente sua remoção imediata de resultados armazenados temporariamente por mecanismos de busca ou outros serviços independentes.",
            "Quando tecnicamente e juridicamente cabível, poderemos adotar medidas para atualizar ou retirar conteúdo das páginas sob nosso controle.",
          ],
        },
        {
          title: "18. Por quanto tempo armazenamos os dados",
          body: [
            "Os dados pessoais são mantidos pelo período necessário para cumprir as finalidades para as quais foram tratados, prestar os serviços solicitados e atender às obrigações legais, regulatórias, contratuais, de segurança e de exercício de direitos.",
            "Alguns registros poderão ser preservados mesmo após o encerramento da conta quando houver obrigação legal, necessidade de prevenção a fraude, investigação de abuso, exercício regular de direitos, resolução de disputas ou outra justificativa legal aplicável.",
            "Quando não existir fundamento para manutenção, os dados poderão ser eliminados ou submetidos a técnicas de anonimização, conforme aplicável.",
          ],
        },
        {
          title: "19. Exclusão da conta não significa eliminação imediata de todos os registros",
          body: [
            "Quando uma conta é encerrada, os dados que deixarem de ser necessários poderão ser eliminados conforme os processos aplicáveis.",
            "Entretanto, determinados registros podem precisar ser preservados por períodos adicionais para cumprimento de obrigações legais ou regulatórias, prevenção de fraude, segurança, auditoria, exercício regular de direitos ou resolução de reclamações e disputas.",
            "Dados efetivamente anonimizados deixam de ser considerados dados pessoais quando a anonimização não puder ser razoavelmente revertida nos termos da legislação.",
          ],
        },
        {
          title: "20. Segurança dos dados",
          body: [
            "O Carros na Cidade adota medidas técnicas e administrativas destinadas a reduzir riscos de acesso não autorizado, perda, alteração, destruição, divulgação ou utilização indevida de dados pessoais.",
            "Essas medidas podem incluir controles de acesso, autenticação, restrição de privilégios, proteção de credenciais, monitoramento, registros técnicos, backups, atualizações de segurança e outras práticas compatíveis com a natureza dos sistemas e dos dados tratados.",
            "Nenhum ambiente conectado à internet pode ser considerado absolutamente imune a incidentes. Por isso, a segurança envolve prevenção, monitoramento e resposta contínua a riscos.",
          ],
        },
        {
          title: "21. Responsabilidade do usuário pela segurança da própria conta",
          body: [
            "O usuário deve utilizar senha segura, manter suas credenciais confidenciais e evitar compartilhar códigos de acesso, links de autenticação ou outras informações que permitam acesso indevido à conta.",
            "Dispositivos compartilhados ou comprometidos podem aumentar o risco de acesso não autorizado.",
            "Caso suspeite de utilização indevida da conta ou comprometimento de suas credenciais, o usuário deve alterar seus dados de acesso quando possível e comunicar o Carros na Cidade pelos canais oficiais.",
          ],
        },
        {
          title: "22. Prevenção a fraude e moderação",
          body: [
            "Podemos utilizar dados e sinais técnicos para identificar comportamentos anormais, tentativas de fraude, anúncios suspeitos, contas abusivas, ataques contra a infraestrutura ou violações das regras da plataforma.",
            "Essas análises podem resultar em solicitações adicionais de informação, limitação temporária de funcionalidades, revisão de anúncios, bloqueio preventivo ou outras medidas de segurança.",
            "Os procedimentos de segurança não constituem garantia de que todas as tentativas de fraude serão detectadas antes de ocorrer qualquer dano.",
          ],
        },
        {
          title: "23. Dados pessoais sensíveis",
          body: [
            "O Carros na Cidade não solicita, como regra geral de funcionamento do portal de anúncios, que usuários publiquem dados pessoais sensíveis em seus anúncios ou perfis públicos.",
            "Os usuários não devem inserir voluntariamente informações sobre saúde, religião, origem racial ou étnica, opinião política, vida sexual, dados genéticos ou biométricos ou outras informações sensíveis quando elas não forem necessárias à funcionalidade utilizada.",
            "Caso o tratamento de dado sensível seja necessário em alguma situação específica, serão observadas as regras aplicáveis a essa categoria de dado.",
          ],
        },
        {
          title: "24. Dados de terceiros inseridos pelos usuários",
          body: [
            "O usuário não deve fornecer dados pessoais de terceiros sem possuir fundamento legítimo para fazê-lo.",
            "Ao inserir informações relacionadas a outra pessoa na plataforma, o usuário declara que possui autorização ou outra justificativa legal adequada para esse tratamento, quando exigida.",
            "O Carros na Cidade poderá remover informações de terceiros quando identificar publicação indevida, violação de direitos ou descumprimento das regras da plataforma.",
          ],
        },
        {
          title: "25. Links, WhatsApp e serviços externos",
          body: [
            "O portal pode conter links para WhatsApp, mapas, instituições financeiras, sistemas de pagamento, redes sociais ou outros serviços mantidos por terceiros.",
            "Ao acessar um ambiente externo, o usuário passa a se relacionar também com o respectivo fornecedor, que poderá realizar tratamentos de dados de acordo com suas próprias políticas e condições.",
            "Esta Política rege os tratamentos realizados sob responsabilidade do Carros na Cidade e não substitui as políticas de privacidade de serviços independentes.",
          ],
        },
        {
          title: "26. Comunicações operacionais",
          body: [
            "Podemos enviar comunicações necessárias ao funcionamento do serviço, como confirmações, avisos de segurança, informações sobre conta, anúncios, pagamentos, alterações importantes ou solicitações realizadas pelo próprio usuário.",
            "Essas comunicações operacionais podem ser necessárias para a prestação adequada do serviço e não devem ser confundidas automaticamente com publicidade.",
          ],
        },
        {
          title: "27. Comunicações comerciais e marketing",
          body: [
            "Quando realizarmos comunicações promocionais ou de marketing, o tratamento será realizado com fundamento legal adequado e observando as preferências disponibilizadas ao usuário.",
            "Quando aplicável, o usuário poderá solicitar o cancelamento de comunicações promocionais pelos mecanismos oferecidos na própria mensagem ou pelos canais oficiais.",
            "O cancelamento de marketing não impede o envio de comunicações estritamente necessárias à segurança ou execução dos serviços contratados.",
          ],
        },
        {
          title: "28. Direitos dos titulares",
          body: [
            "Nos termos da LGPD, o titular pode exercer, conforme o caso, direitos relacionados à confirmação da existência de tratamento, acesso aos dados, correção de informações incompletas, inexatas ou desatualizadas e outras medidas previstas na legislação.",
            "Também podem ser solicitadas, quando cabíveis, anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a legislação, portabilidade, informações sobre compartilhamentos, oposição ao tratamento, revogação de consentimento e eliminação de dados tratados com consentimento, observadas as exceções legais.",
            "O exercício de um direito poderá depender da situação concreta, da base legal utilizada e da existência de obrigação que justifique a manutenção do dado.",
          ],
        },
        {
          title: "29. Como exercer seus direitos",
          body: [
            `Solicitações relacionadas a dados pessoais podem ser encaminhadas para ${SITE_CONTACT.email}.`,
            "Para proteger o próprio titular, poderemos solicitar informações suficientes para confirmar a identidade de quem faz o pedido antes de fornecer, alterar ou excluir dados.",
            "Solicitações serão analisadas conforme sua natureza, a legislação aplicável e os procedimentos de segurança necessários.",
            "Se entender que seus direitos não foram adequadamente atendidos, o titular também poderá utilizar os mecanismos disponibilizados pela Autoridade Nacional de Proteção de Dados e demais órgãos competentes.",
          ],
        },
        {
          title: "30. Verificação de identidade em solicitações de privacidade",
          body: [
            "Antes de atender solicitações que envolvam acesso, alteração, portabilidade ou exclusão de dados, o Carros na Cidade poderá adotar medidas razoáveis para verificar se a solicitação foi realizada pelo próprio titular ou por representante autorizado.",
            "Essa verificação existe para reduzir o risco de divulgação ou alteração de dados pessoais a pessoas não autorizadas.",
          ],
        },
        {
          title: "31. Incidentes de segurança",
          body: [
            "Caso ocorra incidente de segurança envolvendo dados pessoais, o Carros na Cidade adotará medidas compatíveis com a natureza e a gravidade do evento para investigar, conter e mitigar seus efeitos.",
            "Quando exigido pela legislação ou regulamentação aplicável, serão realizadas as comunicações pertinentes à Autoridade Nacional de Proteção de Dados e aos titulares afetados.",
          ],
        },
        {
          title: "32. Solicitações de autoridades e preservação de registros",
          body: [
            "O Carros na Cidade poderá preservar ou fornecer dados e registros quando houver obrigação legal, ordem judicial válida, determinação de autoridade competente ou outra hipótese autorizada pela legislação.",
            "Também poderão ser preservados dados necessários à investigação de fraude, proteção de direitos, segurança dos usuários ou defesa do portal em procedimentos administrativos ou judiciais, observados os requisitos legais aplicáveis.",
          ],
        },
        {
          title: "33. Alterações desta Política",
          body: [
            "Esta Política poderá ser atualizada para refletir mudanças na legislação, regulamentação, funcionalidades, fornecedores, práticas de segurança ou operações do Carros na Cidade.",
            "Quando uma alteração produzir impacto relevante para os titulares, poderemos utilizar meios apropriados para informar os usuários.",
            "A versão mais atual estará disponível nesta página, acompanhada da respectiva data de atualização.",
          ],
        },
        {
          title: "34. Contato sobre privacidade",
          body: [
            `Dúvidas, solicitações ou reclamações relacionadas ao tratamento de dados pessoais podem ser encaminhadas para ${SITE_CONTACT.email}.`,
            "Para facilitar o atendimento, informe de maneira clara a natureza da solicitação e os dados necessários para que possamos localizar a conta ou a interação correspondente, evitando enviar informações desnecessárias.",
          ],
        },
      ]}
      afterSections={
        <div className="space-y-6 text-[15px] leading-7 text-[#5c6881]">
          <div className="rounded-2xl border border-[#cfe0f7] bg-[#f4f8ff] p-5 md:p-6">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#0e62d8]">
              Seus dados e sua privacidade
            </p>

            <h2 className="mt-2 text-[20px] font-extrabold tracking-tight text-[#1d2538]">
              Tratamos dados para operar e proteger a plataforma
            </h2>

            <div className="mt-3 space-y-3">
              <p>
                O Carros na Cidade utiliza dados pessoais de acordo com as
                funcionalidades utilizadas pelo usuário e para finalidades
                relacionadas à operação, segurança, atendimento, publicação de
                anúncios, contratação de serviços e cumprimento de obrigações
                aplicáveis.
              </p>

              <p>
                Não solicitamos que usuários publiquem documentos, dados
                bancários, senhas ou informações pessoais desnecessárias em
                campos públicos de anúncios.
              </p>

              <p>
                Você pode exercer seus direitos relacionados a dados pessoais
                pelos canais oficiais indicados nesta Política.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e4e9f2] bg-white p-5 md:p-6">
            <h2 className="text-[18px] font-extrabold tracking-tight text-[#1d2538]">
              Atenção ao falar com um anunciante
            </h2>

            <p className="mt-2">
              Ao utilizar WhatsApp, telefone ou outro serviço externo para
              entrar em contato com um vendedor, informações compartilhadas
              durante essa conversa poderão ser tratadas diretamente pelo
              anunciante e pelo serviço utilizado. Evite fornecer documentos,
              dados bancários ou outras informações pessoais antes de confirmar
              com quem está falando e por que aquele dado é necessário.
            </p>
          </div>

          <div>
            <p className="font-semibold text-[#1d2538]">
              Documentos e informações relacionadas
            </p>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              <Link
                href="/termos-de-uso"
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                Termos de Uso
              </Link>

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
