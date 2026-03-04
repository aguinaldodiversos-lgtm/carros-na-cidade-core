import type { ReactNode } from "react";

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-[22px] font-extrabold text-[#1f2739]">{children}</h3>;
}

function CountPill({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-[#eceff6] px-3 py-1 text-[15px] font-bold text-[#616d87]">{children}</span>;
}

function SelectField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[17px] font-bold text-[#2f3953]">{label}</span>
      <select className="cnc-select h-[56px] text-[18px] font-semibold text-[#37425d]" defaultValue={value}>
        <option>{value}</option>
        <option>Opcao 1</option>
        <option>Opcao 2</option>
      </select>
    </label>
  );
}

export default function BuyFiltersSidebar() {
  return (
    <aside className="cnc-card h-fit divide-y divide-[#e2e6f0] bg-[#f8f9fc]">
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <SectionTitle>Filtros rapidos</SectionTitle>
          <svg viewBox="0 0 20 20" className="h-5 w-5 text-[#5a6782]" fill="currentColor">
            <path d="m6 12 4-4 4 4H6Z" />
          </svg>
        </div>
        <SelectField label="Marca" value="Sao Paulo" />
        <SelectField label="Modelo" value="Sao Paulo" />
        <SelectField label="Preco ate" value="Sao Paulo" />
        <div className="rounded-full bg-[#dfe4f0] p-1">
          <div className="grid grid-cols-2 gap-1 text-center">
            <button type="button" className="rounded-full bg-white py-2 text-[17px] font-bold text-[#28324b]">
              Carros
            </button>
            <button type="button" className="rounded-full py-2 text-[17px] font-bold text-[#6f7a95]">
              Motos
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <SectionTitle>Localizacao</SectionTitle>
          <svg viewBox="0 0 20 20" className="h-5 w-5 text-[#5a6782]" fill="currentColor">
            <path d="m6 12 4-4 4 4H6Z" />
          </svg>
        </div>
        <select className="cnc-select h-[56px] text-[18px] font-semibold text-[#37425d]" defaultValue="Sao Paulo - SP">
          <option>Sao Paulo - SP</option>
          <option>Campinas - SP</option>
          <option>Santos - SP</option>
        </select>
      </div>

      <div className="space-y-3 p-5">
        <SectionTitle>O que te interessa ver hoje?</SectionTitle>
        <div className="space-y-2 text-[17px] text-[#2f3851]">
          <div className="flex items-center justify-between">
            <span>Mais novo</span>
            <CountPill>1,520</CountPill>
          </div>
          <div className="flex items-center justify-between">
            <span>Mais barato</span>
            <CountPill>130</CountPill>
          </div>
          <div className="flex items-center justify-between">
            <span>Menos rodado</span>
            <CountPill>935</CountPill>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <SectionTitle>Populares</SectionTitle>
          <svg viewBox="0 0 20 20" className="h-5 w-5 text-[#5a6782]" fill="currentColor">
            <path d="m6 12 4-4 4 4H6Z" />
          </svg>
        </div>
        <div className="space-y-3 text-[17px] text-[#35405a]">
          <div className="flex items-center justify-between">
            <span>Toyota</span>
            <span className="text-[#66728c]">1,520</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Chevrolet</span>
            <span className="text-[#66728c]">1,320</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Honda</span>
            <span className="text-[#66728c]">935</span>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <SectionTitle>Marcas populares</SectionTitle>
          <svg viewBox="0 0 20 20" className="h-5 w-5 text-[#5a6782]" fill="currentColor">
            <path d="m6 12 4-4 4 4H6Z" />
          </svg>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["Toyota", "Chevrolet", "Volkswagen", "Honda", "Nissan", "Jeep"].map((brand) => (
            <div
              key={brand}
              className="rounded-xl border border-[#dfe4ef] bg-white px-2 py-4 text-center text-[15px] font-bold text-[#39435d]"
            >
              {brand}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
