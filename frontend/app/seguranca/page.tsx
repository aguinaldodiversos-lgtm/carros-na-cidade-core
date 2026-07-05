import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  // Fragmento SEM o sufixo do site — o root layout aplica
  // `title.template = "%s | Carros na Cidade"`, então enviar o nome do site
  // aqui duplicaria ("... | Carros na Cidade | Carros na Cidade"). Fragmento só
  // → sufixo aparece UMA vez.
  title: "Dicas de Segurança para Comprar e Vender Veículos",
  description:
    "Orientações de segurança para comprar e vender veículos com menos risco de golpe: responsabilidades das partes, pagamentos, dados pessoais, verificação do veículo e como denunciar.",
};

export default function SegurancaPage() {
  return (
    <StaticPageLayout
      eyebrow="Confiança"
      title="Dicas de Segurança para Comprar e Vender Veículos"
      description="O Carros na Cidade é um portal de anúncios que conecta pessoas interessadas em comprar e vender veículos. Nosso objetivo é facilitar a divulgação de ofertas e aproximar compradores, vendedores, lojistas e interessados. Antes de iniciar qualquer negociação, leia atentamente as orientações abaixo."
      sections={[
        {
          title: "Aviso importante sobre responsabilidade",
          body: [
            "O Carros na Cidade não vende veículos, não compra veículos, não intermedeia negociações, não participa de pagamentos, não recebe valores, não garante propostas, não garante a veracidade integral dos anúncios e não assegura a conclusão de nenhuma negociação.",
            "As informações exibidas nos anúncios são fornecidas pelos próprios anunciantes, sejam eles pessoas físicas, lojistas, revendas ou terceiros responsáveis pela publicação.",
            "O portal pode realizar verificações internas, análises de cadastro, revisão de anúncios, bloqueios preventivos e outras medidas de segurança. No entanto, essas verificações são limitadas e não representam garantia de procedência, qualidade, documentação, propriedade, preço, disponibilidade, histórico, estado de conservação ou legitimidade da negociação.",
            "Cabe exclusivamente aos compradores, vendedores e demais interessados realizar suas próprias conferências antes de fechar qualquer negócio.",
          ],
        },
        {
          title: "Responsabilidade do comprador",
          body: [
            "Antes de comprar um veículo anunciado no Carros na Cidade, o comprador deve tomar todos os cuidados necessários para confirmar a segurança da negociação. Recomendamos que o comprador:",
            {
              list: [
                "Confira pessoalmente o veículo antes de qualquer pagamento.",
                "Verifique se o veículo realmente existe e está disponível.",
                "Confirme se os dados do vendedor correspondem aos dados do proprietário ou da loja responsável.",
                "Consulte débitos, multas, restrições, alienação, histórico de leilão, sinistro e eventuais pendências.",
                "Leve o veículo a um mecânico de confiança.",
                "Realize vistoria cautelar em empresa especializada.",
                "Confira chassi, motor, placa, documentos e histórico do veículo.",
                "Não faça pagamento antecipado para reservar o carro.",
                "Não pague sinal sem documentação formal e validação completa da negociação.",
                "Nunca faça pagamento em nome de terceiros.",
                "Não aceite pressão para fechar negócio com urgência.",
                "Desconfie de preços muito abaixo do mercado sem justificativa clara.",
                "Formalize a compra com contrato, recibo, ATPV-e/CRV e demais documentos necessários.",
                "Faça a transferência do veículo pelos meios oficiais.",
              ],
            },
            "A decisão de compra é de responsabilidade exclusiva do comprador.",
          ],
        },
        {
          title: "Responsabilidade do vendedor",
          body: [
            "O vendedor também deve agir com cautela antes de entregar o veículo, documentos ou informações pessoais. Recomendamos que o vendedor:",
            {
              list: [
                "Confirme a identidade do comprador.",
                "Não entregue o veículo antes da confirmação real do pagamento.",
                "Não confie apenas em comprovantes enviados por imagem ou mensagem.",
                "Verifique diretamente em sua conta bancária se o valor foi recebido.",
                "Não aceite pagamento feito por terceiros sem justificativa formal e segura.",
                "Não entregue documentos assinados em branco.",
                "Faça comunicação de venda nos órgãos competentes.",
                "Formalize a negociação por contrato.",
                "Guarde conversas, comprovantes, documentos e registros da negociação.",
                "Marque encontros em locais seguros, movimentados ou em empresas especializadas.",
                "Evite receber desconhecidos em sua residência.",
                "Não compartilhe documentos pessoais sem necessidade.",
              ],
            },
            "A decisão de venda é de responsabilidade exclusiva do vendedor.",
          ],
        },
        {
          title: "Não faça pagamentos antecipados",
          body: [
            "O Carros na Cidade recomenda que nenhum usuário faça pagamentos antecipados sem ter absoluta certeza da segurança da negociação. Não envie Pix, TED, DOC, depósito, sinal, reserva ou qualquer valor antes de:",
            {
              list: [
                "Ver o veículo pessoalmente.",
                "Confirmar a identidade do vendedor.",
                "Verificar a documentação.",
                "Conferir se o veículo está no nome correto.",
                "Fazer vistoria mecânica e cautelar.",
                "Confirmar que a conta de destino pertence ao vendedor legítimo ou à empresa responsável.",
              ],
            },
            "Pagamentos feitos fora da plataforma são de responsabilidade exclusiva das partes envolvidas. O Carros na Cidade não se responsabiliza por valores pagos diretamente entre compradores, vendedores, lojistas, intermediários ou terceiros.",
          ],
        },
        {
          title: "Nunca pague em nome de terceiros",
          body: [
            "Um dos golpes mais comuns em negociações de veículos envolve pagamento para uma pessoa diferente do proprietário ou da loja anunciante. Não faça pagamento para:",
            {
              list: [
                "Parentes do vendedor.",
                "Amigos do vendedor.",
                "Supostos despachantes.",
                "Intermediários.",
                "Contas de terceiros.",
                'Pessoas que dizem estar "ajudando na venda".',
                "Contas com nomes diferentes do anunciante ou proprietário.",
              ],
            },
            "Caso o nome da conta bancária não corresponda ao vendedor legítimo, interrompa a negociação até esclarecer completamente a situação.",
          ],
        },
        {
          title: "Cuidado com o falso intermediário",
          body: [
            "No golpe do falso intermediário, uma pessoa copia um anúncio verdadeiro, conversa separadamente com comprador e vendedor e tenta controlar a negociação. Normalmente, o golpista orienta as partes a não comentarem valores entre si. Em muitos casos, o comprador paga o golpista acreditando estar pagando pelo veículo, enquanto o vendedor real não recebe nada. Desconfie imediatamente se alguém disser frases como:",
            {
              list: [
                '"Não comente o valor com o dono."',
                '"Estou vendendo para um parente."',
                '"O carro é de um amigo."',
                '"Eu sou apenas o intermediário."',
                '"Faça o pagamento nesta outra conta."',
                '"Preciso de um sinal urgente para segurar."',
                '"Tem outra pessoa querendo comprar agora."',
                '"Não precisa fazer vistoria, o carro está perfeito."',
              ],
            },
            "Se houver qualquer dúvida, pare a negociação.",
          ],
        },
        {
          title: "Proteja seus dados pessoais",
          body: [
            "Não forneça dados íntimos, senhas, códigos de verificação, tokens bancários, fotos de cartão, documentos completos ou informações sensíveis para pessoas desconhecidas. O usuário nunca deve informar:",
            {
              list: [
                "Senhas bancárias.",
                "Código recebido por SMS ou WhatsApp.",
                "Código de autenticação em duas etapas.",
                "Foto de cartão de crédito.",
                "Dados completos sem necessidade.",
                "Selfie com documento para desconhecidos.",
                "Acesso remoto ao celular ou computador.",
                "Dados bancários sensíveis.",
                "Links de login recebidos por terceiros.",
              ],
            },
            "O Carros na Cidade nunca solicita senha bancária, código de autenticação, pagamento por fora ou transferência para liberar negociação.",
          ],
        },
        {
          title: "Verifique o veículo antes de fechar negócio",
          body: [
            "A aparência do anúncio não substitui uma avaliação técnica. Antes de comprar, recomendamos:",
            {
              list: [
                "Levar o veículo a um mecânico de confiança.",
                "Fazer laudo cautelar.",
                "Conferir histórico de sinistro.",
                "Consultar passagem por leilão.",
                "Verificar restrições administrativas ou judiciais.",
                "Conferir débitos e multas.",
                "Verificar se há alienação fiduciária.",
                "Conferir quilometragem.",
                "Avaliar pneus, motor, câmbio, suspensão, estrutura e pintura.",
                "Confirmar se os opcionais informados realmente existem no veículo.",
              ],
            },
            "A responsabilidade pela verificação do estado, procedência e documentação do veículo é do interessado na compra.",
          ],
        },
        {
          title: "Anúncios podem conter erros ou alterações",
          body: [
            "As informações dos anúncios podem conter erros de digitação, alterações de preço, dados incompletos, imagens desatualizadas ou divergências em relação ao veículo real. Antes de tomar qualquer decisão, confirme diretamente com o anunciante:",
            {
              list: [
                "Preço atualizado.",
                "Disponibilidade do veículo.",
                "Ano/modelo.",
                "Versão.",
                "Quilometragem.",
                "Condição de documentação.",
                "Estado de conservação.",
                "Forma de pagamento.",
                "Localização do veículo.",
                "Garantias oferecidas pelo vendedor ou loja.",
              ],
            },
            "O Carros na Cidade não garante que todas as informações publicadas estejam completas, atualizadas ou livres de erro.",
          ],
        },
        {
          title: "Negocie com cautela",
          body: [
            "Para sua segurança:",
            {
              list: [
                "Prefira encontros presenciais em locais movimentados.",
                "Evite negociar em locais isolados.",
                "Evite fechar negócio apenas por mensagens.",
                "Faça chamada de vídeo quando necessário.",
                "Pesquise o nome, telefone, CPF ou CNPJ do anunciante.",
                "Verifique reputação da loja, quando for o caso.",
                "Confirme endereço físico da empresa.",
                "Não ceda à pressão emocional ou urgência artificial.",
                'Desconfie de ofertas "boas demais para ser verdade".',
              ],
            },
            "A pressa é uma das principais ferramentas usadas por golpistas.",
          ],
        },
        {
          title: "O papel do Carros na Cidade",
          body: [
            "O Carros na Cidade atua como portal de divulgação de anúncios automotivos. Podemos, a nosso critério:",
            {
              list: [
                "Revisar anúncios.",
                "Remover conteúdos suspeitos.",
                "Bloquear usuários.",
                "Solicitar correções.",
                "Suspender publicações.",
                "Aplicar filtros de segurança.",
                "Receber denúncias.",
              ],
            },
            "Mesmo assim, o portal não garante a identidade plena dos usuários, não garante a existência do veículo, não garante a procedência do anúncio e não substitui a análise individual que cada interessado deve realizar antes da negociação.",
          ],
        },
        {
          title: "Denuncie anúncios suspeitos",
          body: [
            "Se você encontrar um anúncio suspeito, informações falsas, tentativa de golpe, pedido de pagamento antecipado, conta de terceiro ou qualquer conduta irregular, entre em contato com o Carros na Cidade pelos canais oficiais. A denúncia ajuda a tornar o ambiente mais seguro para todos. Sempre que possível, envie:",
            {
              list: [
                "Link do anúncio.",
                "Nome do anunciante.",
                "Telefone usado na negociação.",
                "Prints da conversa.",
                "Descrição do ocorrido.",
              ],
            },
            "O envio de denúncia não significa que o Carros na Cidade se torna parte da negociação ou responsável por eventuais prejuízos, mas permite que a equipe avalie medidas internas cabíveis.",
          ],
        },
        {
          title: "Declaração final",
          body: [
            "Ao utilizar o Carros na Cidade, o usuário declara estar ciente de que o portal é apenas um ambiente de divulgação de anúncios e conexão entre interessados. Toda negociação, verificação, pagamento, entrega, vistoria, documentação, transferência, garantia e responsabilidade sobre o veículo são de exclusiva responsabilidade das partes envolvidas. O Carros na Cidade recomenda cautela, verificação independente e uso dos meios oficiais para compra, venda, pagamento e transferência de veículos. Em caso de dúvida, não conclua a negociação.",
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
