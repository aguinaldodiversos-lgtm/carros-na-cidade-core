export default function BuyResultsToolbar() {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-white p-3 shadow-[0_2px_8px_rgba(18,34,72,0.06)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <select className="cnc-select h-12 min-w-[145px] text-[17px] font-semibold text-[#3a4560]" defaultValue="51 Ultimos">
          <option>51 Ultimos</option>
          <option>100 Ultimos</option>
          <option>200 Ultimos</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex h-12 items-center gap-2 rounded-xl px-3 text-[18px] font-bold text-[#28334a] transition hover:bg-[#f1f4f9]"
        >
          Ultimos
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
            <path d="m6 8 4 4 4-4H6Z" />
          </svg>
        </button>
        <button
          type="button"
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#e8ebf4] px-4 text-[17px] font-bold text-[#2f3a54]"
        >
          Ver no mapa
        </button>
      </div>
    </div>
  );
}
