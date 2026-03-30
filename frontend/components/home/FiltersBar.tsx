const filters = [
  { label: "Cidade", defaultValue: "Sao Paulo" },
  { label: "- Selecionar -" },
  { label: "Modelo -" },
  { label: "Ano" },
  { label: "Preco ate" },
  { label: "Selecionar -" },
  { label: "Categoria" },
];

export default function FiltersBar() {
  return (
    <section className="mt-5 rounded-2xl border border-[#e0e4ef] bg-white p-5">
      <div className="grid gap-4 lg:grid-cols-8">
        {filters.map((filter, index) => (
          <label
            key={`${filter.label}-${index}`}
            className={`${index < 4 ? "lg:col-span-2" : "lg:col-span-2"}`}
          >
            <span className="sr-only">{filter.label}</span>
            <select
              defaultValue={filter.defaultValue ?? filter.label}
              className="cnc-select h-[60px] text-[18px] font-semibold text-[#39445f]"
            >
              <option>{filter.defaultValue ?? filter.label}</option>
              <option>Opcao 1</option>
              <option>Opcao 2</option>
            </select>
          </label>
        ))}

        <button
          type="button"
          className="flex h-[60px] items-center justify-center gap-2 rounded-xl bg-[#0e62d8] text-[20px] font-bold text-white transition hover:bg-[#0c4fb0] lg:col-span-2"
        >
          Pesquisar
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
            <path d="m7 4 6 6-6 6" />
          </svg>
        </button>
      </div>
    </section>
  );
}
