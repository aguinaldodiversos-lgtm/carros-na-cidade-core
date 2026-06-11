// frontend/components/seo/FaqBlock.tsx
//
// Fase 4.3 (§7) — bloco de FAQ VISÍVEL para páginas territoriais.
// Server component, acordeão nativo (<details>) — sem JS no cliente. As
// mesmas entradas alimentam o FAQPage JSON-LD (buildFaqPageJsonLd), então o
// schema só existe quando este bloco renderiza (regra do §6).
import type { FaqEntry } from "@/lib/seo/faq";

export function FaqBlock({ title, entries }: { title: string; entries: FaqEntry[] }) {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  return (
    <section aria-label={title} className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <h2 className="text-[18px] font-extrabold text-cnc-text-strong sm:text-[20px]">{title}</h2>
      <div className="mt-3 space-y-2">
        {entries.map((entry, i) => (
          <details
            key={i}
            className="group rounded-xl border border-cnc-line bg-white px-4 py-3 shadow-card open:shadow-premium"
          >
            <summary className="cursor-pointer list-none text-[14px] font-bold text-cnc-text-strong marker:hidden">
              {entry.question}
            </summary>
            <p className="mt-2 text-[13px] leading-relaxed text-cnc-muted sm:text-[14px]">
              {entry.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

export default FaqBlock;
