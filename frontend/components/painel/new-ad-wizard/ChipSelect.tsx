"use client";

type Item = { id: string; label: string };

type Props = {
  items: Item[];
  selected: string[];
  onToggle: (id: string) => void;
};

export default function ChipSelect({ items, selected, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const on = selected.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              on
                ? "border-[#2F67F6] bg-[#EEF4FF] text-[#1D2440] shadow-sm"
                : "border-[#E5E9F2] bg-white text-[#5C647C] hover:border-[#C7D7F8]"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
