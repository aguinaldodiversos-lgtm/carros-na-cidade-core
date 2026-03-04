import Link from "next/link";

type CTASectionProps = {
  title: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

export default function CTASection({
  title,
  description,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: CTASectionProps) {
  return (
    <section className="mt-8 overflow-hidden rounded-2xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] p-6 text-white shadow-[0_12px_30px_rgba(14,98,216,0.28)]">
      <h2 className="text-2xl font-extrabold">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm text-white/90">{description}</p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={primaryHref}
          className="inline-flex h-11 items-center rounded-xl bg-white px-5 text-[15px] font-bold text-[#0e62d8] transition hover:bg-[#ecf3ff]"
        >
          {primaryLabel}
        </Link>
        {secondaryLabel && secondaryHref && (
          <Link
            href={secondaryHref}
            className="inline-flex h-11 items-center rounded-xl border border-white/35 px-5 text-[15px] font-bold text-white transition hover:bg-white/15"
          >
            {secondaryLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
