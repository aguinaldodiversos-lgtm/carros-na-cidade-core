// frontend/components/PersuasiveSection.tsx

export default function PersuasiveSection() {
  return (
    <section className="bg-gray-100 mt-20 py-20">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-10 px-6">
        <div className="bg-white p-8 rounded-2xl shadow">
          <h3 className="text-xl font-bold mb-3">
            Venda mais rápido
          </h3>
          <p className="text-gray-600 mb-6">
            Seus anúncios aparecem para compradores da sua cidade com alta intenção.
          </p>
          <button className="bg-yellow-400 px-5 py-2 rounded-lg font-bold">
            Anunciar agora
          </button>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow">
          <h3 className="text-xl font-bold mb-3">
            Negociação direta
          </h3>
          <p className="text-gray-600 mb-6">
            Botão de WhatsApp direto com o vendedor. Sem intermediários.
          </p>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow">
          <h3 className="text-xl font-bold mb-3">
            Alcance regional inteligente
          </h3>
          <p className="text-gray-600 mb-6">
            Nossa IA posiciona seu anúncio para quem realmente quer comprar.
          </p>
        </div>
      </div>
    </section>
  );
}
