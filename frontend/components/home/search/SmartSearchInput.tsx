"use client";

type SmartSearchInputProps = {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

export function SmartSearchInput({ id, name = "q", value, onChange, placeholder }: SmartSearchInputProps) {
  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-violet-500"
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <path d="M12 2l1.09 3.26L16 6l-2.91 1.74L12 11l-1.09-3.26L8 6l2.91-1.74L12 2z" />
        </svg>
      </span>
      <input
        id={id}
        type="search"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        placeholder={placeholder}
        className="h-14 w-full rounded-full border border-slate-300/90 bg-slate-50/50 pl-12 pr-4 text-[15px] font-medium text-slate-900 shadow-inner outline-none ring-violet-500/10 transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 sm:h-[3.75rem] sm:text-base"
      />
    </div>
  );
}
