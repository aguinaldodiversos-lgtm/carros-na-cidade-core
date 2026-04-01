import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Central de ajuda | Carros na Cidade",
  description: "Encontre respostas para dúvidas sobre anúncios, conta, pagamentos, segurança e funcionalidades do portal Carros na Cidade.",
  alternates: { canonical: "/ajuda" },
};

export const revalidate = 3600;

const HELP_CATEGORIES = [
  {
    icon: "👤",
    title: "Conta e cadastro",
    desc: "Criação de conta, verificação de CPF/CNPJ e gerenciamento de dados.",
    topics: ["Como criar uma conta", "Verificar meu documento", "Alterar senha", "Deletar conta"],
  },
  {
    icon: "📢",
    title: "Anúncios",
    desc: "Publicação, edição, pausa e remoção de anúncios.",
    topics: ["Como publicar um anúncio", "Editar informações", "Pausar anúncio", "Adicionar fotos"],
  },
  {
    icon: "💳",
    title: "Pagamentos e planos",
    desc: "Assinaturas, cobranças, cancelamentos e reembolsos.",
    topics: ["Como funciona o plano", "Cancelar assinatura", "Solicitar reembolso", "Formas de pagamento"],
  },
  {
    icon: "🔒",
    title: "Segurança",
    desc: "Proteção de conta, denúncias e boas práticas.",
    topics: ["Conta invadida", "Denunciar anúncio", "Evitar fraudes", "Privacidade"],
  },
  {
    icon: "🏪",
    title: "Para lojistas",
    desc: "Cadastro de loja, planos CNPJ e perfil verificado.",
    topics: ["Como verificar CNPJ", "Perfil de loja", "Planos para loja", "Dashboard da loja"],
  },
  {
    icon: "🔍",
    title: "Busca e filtros",
    desc: "Como usar a busca, filtros e tabela FIPE.",
    topics: ["Filtros avançados", "Tabela FIPE integrada", "Alertas de busca", "Ordenação dos resultados"],
  },
];

export default function AjudaPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      {/* Header */}
      <div className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0e62d8]">Central de ajuda</p>
          <h1 className="mt-3 text-[34px] font-extrabold tracking-tight text-[#1d2538]">
            Como podemos ajudar?
          </h1>
          <p className="mt-3 text-[15px] text-[#6b7488]">
            Selecione uma categoria ou busque pelo tópico que precisa.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Categories */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HELP_CATEGORIES.map((cat) => (
            <div key={cat.title} className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm">
              <div className="text-2xl">{cat.icon}</div>
              <h2 className="mt-3 text-[15px] font-extrabold text-[#1d2538]">{cat.title}</h2>
              <p className="mt-1 text-[13px] text-[#6b7488]">{cat.desc}</p>
              <ul className="mt-3 space-y-1.5">
                {cat.topics.map((topic) => (
                  <li key={topic}>
                    <span className="text-[13px] text-[#5c6881]">→ {topic}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Contact */}
        <section className="mt-10 rounded-2xl border border-[#dfe4ef] bg-white p-6 text-center shadow-sm">
          <h2 className="text-[20px] font-extrabold text-[#1d2538]">Não encontrou a resposta?</h2>
          <p className="mt-1.5 text-[14px] text-[#6b7488]">
            Entre em contato com nosso time de suporte direto.
          </p>
          <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/contato" className="rounded-xl bg-[#0e62d8] px-6 py-3 text-[14px] font-bold text-white transition hover:bg-[#0b54be]">
              Falar com suporte
            </Link>
            <Link href="/faq" className="rounded-xl border border-[#d4daea] bg-white px-6 py-3 text-[14px] font-semibold text-[#333d54] transition hover:border-[#0e62d8]">
              Ver FAQ completo
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
