// frontend/components/FiltersBar.tsx

export default function FiltersBar() {
  return (
    <section className="bg-white shadow-lg rounded-2xl p-6 -mt-10 relative z-20 max-w-6xl mx-auto">
      <div className="grid md:grid-cols-5 gap-4">
        <select className="border p-3 rounded-lg">
          <option>Cidade</option>
        </select>
        <select className="border p-3 rounded-lg">
          <option>Marca</option>
        </select>
        <select className="border p-3 rounded-lg">
          <option>Modelo</option>
        </select>
        <select className="border p-3 rounded-lg">
          <option>Ano</option>
        </select>
        <button className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold rounded-lg">
          Pesquisar
        </button>
      </div>
    </section>
  );
}
