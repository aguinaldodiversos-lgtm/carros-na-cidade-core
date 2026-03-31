"use client";

import { useState, type ReactNode } from "react";

type FilterSectionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  id?: string;
};

export function FilterSection({ title, children, defaultOpen = true, id }: FilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className="border-b border-slate-100 py-4 last:border-0 last:pb-0"
      aria-labelledby={id ? `${id}-heading` : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg text-left transition hover:bg-slate-50/80"
        aria-expanded={open}
      >
        <span id={id ? `${id}-heading` : undefined} className="text-[13px] font-bold text-slate-900">
          {title}
        </span>
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
          fill="currentColor"
          aria-hidden
        >
          <path d="m5 7 5 6 5-6H5Z" />
        </svg>
      </button>
      {open ? <div className="mt-4 space-y-4">{children}</div> : null}
    </section>
  );
}
