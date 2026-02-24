// frontend/components/HeroCarousel.tsx

export default function HeroCarousel() {
  return (
    <section className="relative w-full h-[420px] rounded-2xl overflow-hidden bg-gradient-to-r from-black/80 to-black/20 text-white flex items-center px-16">
      <div className="max-w-xl z-10">
        <h1 className="text-5xl font-bold mb-4">
          Encontre o carro ideal na sua cidade
        </h1>
        <p className="text-lg mb-6">
          Milhares de ofertas verificadas. Negocie direto com o vendedor.
        </p>
        <button className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-6 py-3 rounded-lg transition">
          Buscar agora
        </button>
      </div>
    </section>
  );
}
