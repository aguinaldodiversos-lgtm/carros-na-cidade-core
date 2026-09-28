import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";
import { SITE_CONTACT } from "@/lib/site/site-navigation";

export const metadata: Metadata = {
  title: "LGPD | Carros na Cidade",
  description:
    "Conheça seus direitos sobre dados pessoais e saiba como o Carros na Cidade aplica a Lei Geral de Proteção de Dados em sua plataforma.",
  alternates: {
    canonical: "/lgpd",
  },
};

export default function LgpdPage() {
  return (
    <StaticPageLayout
      eyebrow="Proteção de dados"
      title="LGPD no Carros na Cidade"
      description="A Lei Geral de Proteção de Dados Pessoais — LGPD (Lei nº 13.709/2018) estabelece regras para o tratamento de dados pessoais e garante direitos aos titulares. Nesta página explicamos, em linguagem clara, como exercer esses direitos perante o Carros na Cidade."
      sections={[
        {
          title: "1. Nosso compromisso com a proteção de dados",
          body: [
            "O Carros na Cidade busca tratar dados pessoais de forma compatível com a legislação aplicável, observando princípios como finalidade, adequação, necessidade, transparência, segurança, prevenção, não discriminação e responsabilização.",
            "Os dados pessoais tratados pela plataforma devem ser utilizados apenas para finalidades legítimas relacionadas à operação do portal, segurança, atendimento, publicação de anúncios, contratação de serviços, cumprimento de obrigações e demais hipóteses informadas ao usuário.",
            "Esta página deve ser lida em conjunto com nossa Política de Privacidade e nossos Termos de Uso.",
          ],
        },
        {
          title: "2. O que é um dado pessoal",
          body: [
            "Dado pessoal é uma informação relacionada a uma pessoa natural identificada ou identificável.",
            "Dependendo da funcionalidade utilizada, podem ser considerados dados pessoais informações como nome, telefone, e-mail, cidade, CPF, dados de cadastro, endereço IP, identificadores técnicos e outras informações relacionadas a uma pessoa.",
            "Nem todos esses dados são coletados de todos os usuários. O tratamento depende das funcionalidades utilizadas e da relação do usuário com a plataforma.",
          ],
        },
        {
          title: "3. Quem é o titular dos dados",
          body: [
            "Titular é a pessoa natural a quem os dados pessoais se referem.",
            "Usuários cadastrados, anunciantes, compradores interessados, representantes de lojas e outras pessoas que interajam com o Carros na Cidade podem ser titulares de dados pessoais tratados pela plataforma.",
          ],
        },
        {
          title: "4. Papel do Carros na Cidade",
          body: [
            "Nas operações em que determina as finalidades e os meios essenciais do tratamento de dados pessoais, o responsável pela operação do Carros na Cidade atua como controlador.",
            "Empresas contratadas para executar determinados serviços em nosso nome, como infraestrutura, armazenamento, comunicações ou processamento de pagamentos, poderão atuar como operadores ou assumir responsabilidades próprias conforme a natureza do serviço prestado.",
            "A classificação jurídica de cada participante depende da atividade efetivamente realizada em cada operação de tratamento.",
          ],
        },
        {
          title: "5. Quais direitos a LGPD garante",
          body: [
            "O titular pode solicitar confirmação sobre a existência de tratamento de seus dados pessoais.",
            "Também pode solicitar acesso aos seus dados, correção de informações incompletas, inexatas ou desatualizadas e, quando cabível, anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a legislação.",
            "A LGPD também prevê, conforme o caso, direitos relacionados à portabilidade, informação sobre compartilhamentos, revogação do consentimento, eliminação de dados tratados com consentimento nas hipóteses legais, oposição a determinados tratamentos e outros direitos previstos em lei.",
            "O exercício desses direitos será analisado conforme a natureza da solicitação, a base legal utilizada e as obrigações aplicáveis ao tratamento.",
          ],
        },
        {
          title: "6. Confirmação e acesso aos seus dados",
          body: [
            "Você pode solicitar confirmação sobre a existência de tratamento de dados pessoais e acesso às informações relacionadas a você.",
            "Nos casos previstos pela LGPD, a confirmação ou o acesso poderão ser fornecidos de forma simplificada imediatamente ou por meio de declaração clara e completa no prazo legal aplicável.",
            "A resposta completa poderá apresentar informações como origem dos dados, critérios utilizados e finalidade do tratamento, observados os limites legais e eventuais segredos comercial e industrial.",
          ],
        },
        {
          title: "7. Correção de dados",
          body: [
            "Se identificar informação pessoal incompleta, inexata ou desatualizada, você poderá solicitar sua correção.",
            "Alguns dados poderão ser atualizados diretamente pelo próprio usuário nas áreas de conta e painel, quando essa funcionalidade estiver disponível.",
            "Quando a alteração depender da nossa equipe, a solicitação poderá ser encaminhada pelo canal indicado nesta página.",
          ],
        },
        {
          title: "8. Exclusão, anonimização e bloqueio",
          body: [
            "A LGPD permite solicitar, em determinadas situações, anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a legislação.",
            "Também poderá ser solicitada a eliminação de dados tratados com fundamento no consentimento, quando aplicável e observadas as hipóteses legais de conservação.",
            "Uma solicitação de exclusão não significa necessariamente que todos os registros possam ser apagados imediatamente. Alguns dados podem precisar ser preservados para cumprimento de obrigação legal ou regulatória, prevenção de fraude, segurança, exercício regular de direitos ou outras hipóteses autorizadas pela legislação.",
          ],
        },
        {
          title: "9. Revogação do consentimento",
          body: [
            "Quando determinado tratamento depender de consentimento, o titular poderá revogá-lo conforme os meios disponibilizados para aquela finalidade.",
            "A revogação não torna automaticamente irregulares os tratamentos realizados de forma legítima enquanto o consentimento estava válido.",
            "Alguns tratamentos poderão continuar quando houver outra base legal que autorize sua realização.",
          ],
        },
        {
          title: "10. Informação sobre compartilhamento",
          body: [
            "O titular pode solicitar informações relacionadas ao uso compartilhado de seus dados pessoais, conforme previsto na legislação.",
            "Dados poderão ser compartilhados com prestadores necessários à operação do portal, como fornecedores de infraestrutura, armazenamento, comunicações, segurança e pagamentos, além das hipóteses previstas na Política de Privacidade.",
            "Também poderão ocorrer compartilhamentos quando necessários ao cumprimento de obrigação legal, ordem judicial, determinação de autoridade competente, prevenção de fraude ou exercício regular de direitos.",
          ],
        },
        {
          title: "11. Portabilidade",
          body: [
            "A LGPD prevê o direito à portabilidade dos dados a outro fornecedor de serviço ou produto, observadas as regras da Autoridade Nacional de Proteção de Dados, os segredos comercial e industrial e as condições aplicáveis ao caso concreto.",
            "Solicitações de portabilidade serão analisadas conforme a regulamentação vigente e a natureza dos dados envolvidos.",
          ],
        },
        {
          title: "12. Oposição ao tratamento",
          body: [
            "Nas hipóteses previstas pela LGPD, o titular poderá se opor a determinado tratamento quando entender que ele está sendo realizado em desconformidade com a legislação.",
            "A solicitação será analisada considerando a finalidade, a base legal utilizada e as circunstâncias concretas do tratamento.",
          ],
        },
        {
          title: "13. Decisões automatizadas",
          body: [
            "Quando houver decisão tomada unicamente com base em tratamento automatizado de dados pessoais que afete os interesses do titular, poderão ser exercidos os direitos previstos na LGPD relacionados à revisão da decisão e às informações sobre os critérios e procedimentos utilizados.",
            "Eventuais solicitações serão analisadas observando a legislação aplicável e a proteção dos segredos comercial e industrial.",
          ],
        },
        {
          title: "14. Como fazer uma solicitação LGPD",
          body: [
            `Envie sua solicitação para ${SITE_CONTACT.email} e utilize, de preferência, um assunto claro, como “LGPD — solicitação de titular”.`,
            "Informe qual direito deseja exercer e forneça apenas os dados necessários para localizarmos sua conta ou a informação relacionada à solicitação.",
            "Evite enviar senhas, dados bancários, fotografias desnecessárias de documentos ou outras informações que não tenham sido solicitadas.",
          ],
        },
        {
          title: "15. Confirmação da identidade do solicitante",
          body: [
            "Para proteger os próprios titulares, podemos solicitar informações adicionais quando forem necessárias para confirmar a identidade da pessoa que está fazendo a solicitação.",
            "Essa verificação busca impedir que terceiros obtenham, alterem ou excluam dados pessoais sem autorização.",
            "A quantidade de informações solicitadas para essa verificação deverá ser compatível com o risco e com a natureza do pedido.",
          ],
        },
        {
          title: "16. Solicitações feitas por representantes",
          body: [
            "Solicitações também poderão ser apresentadas por representante legal ou pessoa devidamente autorizada pelo titular, quando permitido.",
            "Nessas situações, poderão ser solicitados elementos suficientes para confirmar a identidade do titular e os poderes de representação.",
          ],
        },
        {
          title: "17. Prazo de atendimento",
          body: [
            "As solicitações serão atendidas nos prazos previstos na legislação e regulamentação aplicáveis.",
            "Para confirmação de existência ou acesso aos dados, a LGPD prevê resposta simplificada imediata ou declaração clara e completa no prazo de até 15 dias, conforme a modalidade aplicável.",
            "Outros direitos poderão possuir procedimentos e prazos próprios conforme sua natureza e a regulamentação vigente.",
          ],
        },
        {
          title: "18. Quando um pedido pode não ser atendido integralmente",
          body: [
            "Determinadas solicitações podem não ser atendidas integralmente quando houver fundamento legal para conservar os dados ou limitar o fornecimento de determinadas informações.",
            "Isso pode ocorrer, por exemplo, quando houver obrigação legal ou regulatória, necessidade de preservar direitos de terceiros, prevenção de fraude, exercício regular de direitos ou outras hipóteses previstas na legislação.",
            "Quando aplicável, apresentaremos esclarecimentos sobre a impossibilidade ou limitação do atendimento.",
          ],
        },
        {
          title: "19. Exercício dos direitos é gratuito",
          body: [
            "O Carros na Cidade não cobra do titular pelo exercício dos direitos previstos na LGPD.",
            "Isso não se confunde com valores eventualmente cobrados pela utilização de serviços comerciais da plataforma, como planos, assinaturas ou destaques de anúncios.",
          ],
        },
        {
          title: "20. Bases legais para o tratamento",
          body: [
            "Nem todo tratamento de dados pessoais depende de consentimento.",
            "Dependendo da finalidade, o Carros na Cidade poderá tratar dados com fundamento, entre outras hipóteses aplicáveis, na execução de contrato ou procedimentos relacionados a ele, cumprimento de obrigação legal ou regulatória, exercício regular de direitos, legítimo interesse ou consentimento.",
            "A base legal utilizada depende da operação específica e deve ser compatível com a finalidade do tratamento.",
          ],
        },
        {
          title: "21. Segurança dos dados pessoais",
          body: [
            "Adotamos medidas técnicas e administrativas destinadas a reduzir riscos de acesso não autorizado, perda, alteração, destruição, divulgação ou tratamento inadequado de dados pessoais.",
            "As medidas de segurança são avaliadas de acordo com a natureza dos sistemas, dos dados tratados e dos riscos associados às operações.",
            "Nenhum sistema conectado à internet é absolutamente imune a incidentes, razão pela qual segurança, monitoramento e prevenção devem ser processos contínuos.",
          ],
        },
        {
          title: "22. Incidentes envolvendo dados pessoais",
          body: [
            "Caso seja identificado incidente de segurança envolvendo dados pessoais, serão adotadas medidas para investigar, conter e reduzir seus impactos.",
            "Quando a legislação ou a regulamentação exigir, serão realizadas as comunicações pertinentes à Autoridade Nacional de Proteção de Dados e aos titulares afetados.",
          ],
        },
        {
          title: "23. Prevenção a fraude e abuso",
          body: [
            "Dados pessoais e informações técnicas podem ser tratados para prevenir fraude, proteger contas, identificar comportamentos suspeitos, investigar incidentes e aplicar regras de segurança da plataforma.",
            "Essas atividades podem resultar em verificações adicionais, bloqueios preventivos, revisão de anúncios ou limitação temporária de funcionalidades quando necessário.",
          ],
        },
        {
          title: "24. Dados publicados pelo próprio usuário",
          body: [
            "Algumas informações inseridas em anúncios, perfis de lojas ou outras páginas públicas são destinadas à divulgação e poderão ser visualizadas por visitantes do portal.",
            "O usuário deve evitar publicar documentos, dados bancários, senhas ou informações pessoais desnecessárias em campos públicos.",
            "Quando um dado é tornado público pelo próprio usuário dentro de uma funcionalidade destinada à divulgação, seu tratamento continua sujeito às regras aplicáveis e às finalidades da plataforma.",
          ],
        },
        {
          title: "25. Contato com anunciantes e serviços externos",
          body: [
            "Quando o usuário acessa WhatsApp, telefone, instituição financeira, serviço de pagamento ou outro serviço externo a partir do Carros na Cidade, aquele terceiro poderá realizar tratamentos de dados sob sua própria responsabilidade.",
            "A Política de Privacidade do Carros na Cidade não substitui as políticas e condições dos serviços externos utilizados pelo usuário.",
            "Tenha cuidado ao fornecer documentos, dados financeiros ou informações pessoais durante negociações com anunciantes.",
          ],
        },
        {
          title: "26. Retenção de dados",
          body: [
            "Os dados pessoais serão mantidos pelo período necessário para atender às finalidades para as quais foram tratados e às obrigações aplicáveis.",
            "Após o término do tratamento, determinados dados poderão ser conservados quando houver fundamento legal, inclusive para cumprimento de obrigações, segurança, prevenção a fraudes e exercício regular de direitos.",
            "Quando não houver mais fundamento para manutenção, os dados poderão ser eliminados ou anonimizados, conforme aplicável.",
          ],
        },
        {
          title: "27. Transferência internacional",
          body: [
            "Alguns fornecedores de tecnologia utilizados pela plataforma podem possuir infraestrutura ou operações localizadas fora do Brasil.",
            "Quando houver transferência internacional de dados pessoais, serão observadas as regras e mecanismos previstos na legislação e regulamentação aplicáveis.",
          ],
        },
        {
          title: "28. Autoridade Nacional de Proteção de Dados",
          body: [
            "A Autoridade Nacional de Proteção de Dados — ANPD é o órgão responsável por zelar pela proteção de dados pessoais e fiscalizar a aplicação da LGPD no Brasil.",
            "Antes de apresentar uma petição relacionada ao exercício de direitos perante a ANPD, recomenda-se que o titular procure inicialmente o controlador pelos canais disponibilizados para esse atendimento.",
            "Guarde e-mails, protocolos ou outros registros que demonstrem a solicitação realizada e a resposta recebida.",
          ],
        },
        {
          title: "29. Atualizações desta página",
          body: [
            "Esta página poderá ser atualizada para refletir mudanças na legislação, regulamentação, funcionalidades da plataforma ou procedimentos relacionados à proteção de dados.",
            "Alterações relevantes poderão ser comunicadas pelos meios considerados adequados.",
            "A versão mais recente permanecerá disponível no próprio portal.",
          ],
        },
        {
          title: "30. Canal para exercício de direitos",
          body: [
            `Para exercer direitos relacionados à LGPD ou tirar dúvidas sobre o tratamento de dados pessoais pelo Carros na Cidade, entre em contato pelo e-mail ${SITE_CONTACT.email}.`,
            "No assunto da mensagem, recomendamos utilizar “LGPD” ou “Privacidade” para facilitar o encaminhamento da solicitação.",
          ],
        },
      ]}
      afterSections={
        <div className="space-y-6 text-[15px] leading-7 text-[#5c6881]">
          <div className="rounded-2xl border border-[#cfe0f7] bg-[#f4f8ff] p-5 md:p-6">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#0e62d8]">
              Seus direitos
            </p>

            <h2 className="mt-2 text-[20px] font-extrabold tracking-tight text-[#1d2538]">
              Você pode solicitar informações sobre seus dados
            </h2>

            <div className="mt-3 space-y-3">
              <p>
                Você pode solicitar confirmação da existência de tratamento,
                acesso, correção e exercer outros direitos previstos na LGPD,
                conforme as condições aplicáveis a cada situação.
              </p>

              <p>
                Para proteger seus dados, poderemos solicitar informações
                suficientes para confirmar sua identidade antes de atender
                pedidos que envolvam acesso, alteração ou exclusão.
              </p>

              <p>
                O exercício dos direitos previstos na LGPD é gratuito.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e4e9f2] bg-white p-5 md:p-6">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#0e62d8]">
              Canal de privacidade
            </p>

            <h2 className="mt-2 text-[18px] font-extrabold tracking-tight text-[#1d2538]">
              Como falar conosco sobre seus dados
            </h2>

            <p className="mt-2">
              Envie sua solicitação para{" "}
              <a
                href={`mailto:${SITE_CONTACT.email}`}
                className="font-semibold text-[#0e62d8] hover:underline"
              >
                {SITE_CONTACT.email}
              </a>
              , informando claramente o direito que deseja exercer. Não envie
              senhas, dados bancários ou documentos desnecessários.
            </p>
          </div>

          <div>
            <p className="font-semibold text-[#1d2538]">
              Documentos relacionados
            </p>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
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
