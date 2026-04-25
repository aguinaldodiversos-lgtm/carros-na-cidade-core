import type { FaqItem } from "@/lib/market/market-data";

type FAQSectionProps = {
  title: string;
  items: FaqItem[];
};

export default function FAQSection({ title, items }: FAQSectionProps) {
  return (
    <section className="mt-8 rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
      <h2 className="text-2xl font-extrabold text-[#1d2538]">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <details
            key={item.question}
            className="rounded-xl border border-[#e1e5ef] bg-[#f9fbff] p-4"
          >
            <summary className="cursor-pointer list-none text-[15px] font-bold text-[#22304b]">
              {item.question}
            </summary>
            <p className="mt-2 text-sm leading-snug text-[#4d5870]">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
