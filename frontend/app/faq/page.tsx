import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ — Perguntas frequentes | Carros na Cidade",
  description: "Respostas para as perguntas mais frequentes sobre o portal Carros na Cidade.",
  alternates: { canonical: "/faq" },
};

export const revalidate = 3600;

const FAQS = [
  {
    category: "Conta",
    items: [
      { q: "Como criar uma conta no Carros na Cidade?", a: "Acesse /cadastro e preencha os dados básicos: nome, e-mail, senha e documento (CPF ou CNPJ). A verificação do documento é feita automaticamente." },
      { q: "Posso usar o portal sem criar conta?", a: "Sim. A busca e a visualização de anúncios são públicas. Para publicar anúncios ou acessar o dashboard é necessário conta." },
      { q: "Como recuperar minha senha?", a: "Na página de login, clique em 'Esqueci minha senha'. Você receberá um link de redefinição no e-mail cadastrado." },
    ],
  },
  {
    category: "Anúncios",
    items: [
      { q: "Quantos anúncios posso publicar gratuitamente?", a: "Particulares (CPF) podem ter até 3 anúncios ativos gratuitamente. Lojas com CNPJ verificado têm até 20 anúncios gratuitos." },
      { q: "Por quanto tempo meu anúncio fica no ar?", a: "Anúncios ativos permanecem visíveis enquanto a conta estiver ativa. Você pode pausar ou remover a qualquer momento." },
      { q: "Como adicionar fotos ao anúncio?", a: "No formulário de criação/edição do anúncio, você pode enviar múltiplas fotos. Recomendamos no mínimo 5 fotos de boa qualidade." },
      { q: "Posso editar um anúncio após publicar?", a: "Sim. Acesse o dashboard, localize o anúncio e clique em 'Editar' para atualizar as informações ou fotos." },
    ],
  },
  {
    category: "Pagamentos",
    items: [
      { q: "Como funciona a cobrança dos planos pagos?", a: "Planos mensais são cobrados via Mercado Pago com renovação automática. Planos avulsos são pagamento único." },
      { q: "Posso cancelar a assinatura a qualquer momento?", a: "Sim. Cancele pelo dashboard em 'Assinatura'. Os benefícios permanecem até o fim do período já pago." },
      { q: "O portal cobra comissão por venda?", a: "Não. O Carros na Cidade não cobra comissão sobre o valor da venda. Planos pagos são apenas para destaque e maior volume." },
    ],
  },
  {
    category: "Segurança",
    items: [
      { q: "Como evitar fraudes ao comprar um veículo?", a: "Nunca faça pagamento antecipado sem ver o veículo pessoalmente. Solicite laudo de procedência, verifique no DETRAN e cheque o histórico do vendedor." },
      { q: "Como denunciar um anúncio suspeito?", a: "Na página do anúncio, clique em 'Denunciar' e selecione o motivo. Nossa equipe analisa e remove conteúdo indevido." },
      { q: "Meus dados estão seguros?", a: "Sim. Seguimos as normas da LGPD. Senhas são armazenadas com hash bcrypt e dados pessoais são tratados conforme nossa política de privacidade." },
    ],
  },
];

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      <div className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <nav className="mb-4 text-[13px] text-[#6b7488]">
            <Link href="/" className="font-semibold text-[#0e62d8] hover:text-[#0b54be]">Home</Link>
            <span className="mx-2">/</span>
            <Link href="/ajuda" className="font-semibold text-[#0e62d8] hover:text-[#0b54be]">Ajuda</Link>
            <span className="mx-2">/</span>
            <span>FAQ</span>
          </nav>
          <h1 className="text-[32px] font-extrabold tracking-tight text-[#1d2538]">
            Perguntas frequentes
          </h1>
          <p className="mt-1.5 text-[15px] text-[#6b7488]">
            As dúvidas mais comuns sobre o Carros na Cidade.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-10">
        {FAQS.map((section) => (
          <section key={section.category}>
            <h2 className="text-[20px] font-extrabold text-[#1d2538]">{section.category}</h2>
            <div className="mt-4 space-y-3">
              {section.items.map((faq) => (
                <details key={faq.q} className="group rounded-xl border border-[#dfe4ef] bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                    <span className="text-[14px] font-bold text-[#1d2538]">{faq.q}</span>
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0 text-[#72809a] transition-transform group-open:rotate-180">
                      <path d="M5 7l5 6 5-6H5Z" />
                    </svg>
                  </summary>
                  <div className="px-5 pb-4 text-[14px] leading-6 text-[#5c6881]">{faq.a}</div>
                </details>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-2xl border border-[#dfe4ef] bg-white p-6 text-center">
          <p className="text-[15px] font-extrabold text-[#1d2538]">Ainda com dúvidas?</p>
          <Link href="/contato" className="mt-4 inline-flex items-center justify-center rounded-xl bg-[#0e62d8] px-6 py-3 text-[14px] font-bold text-white transition hover:bg-[#0b54be]">
            Falar com suporte
          </Link>
        </section>
      </div>
    </main>
  );
}
