import type { ReactNode } from "react";
import Link from "next/link";

type StaticPageSection = {
  title: string;
  body: string[];
};

interface StaticPageLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  sections: StaticPageSection[];
  /** Conteúdo opcional após as seções (ex.: links legais). */
  afterSections?: ReactNode;
}

export function StaticPageLayout({
  eyebrow,
  title,
  description,
  sections,
  afterSections,
}: StaticPageLayoutProps) {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-14">
        <div className="rounded-[24px] border border-[#dfe4ef] bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)] md:p-10">
          <nav className="text-sm text-[#6b7488]">
            <Link href="/" className="font-semibold text-[#0e62d8] transition hover:text-[#0b54be]">
              Home
            </Link>
            <span className="mx-2">/</span>
            <span>{title}</span>
          </nav>

          <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-[#72809a]">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-[34px] font-extrabold tracking-tight text-[#1d2538] md:text-[44px]">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-[16px] leading-7 text-[#5c6881]">{description}</p>

          <div className="mt-8 space-y-8">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-[22px] font-extrabold text-[#1d2538]">{section.title}</h2>
                <div className="mt-3 space-y-4 text-[16px] leading-7 text-[#5c6881]">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {afterSections ? (
            <div className="mt-2 border-t border-[#eef1f7] pt-6">{afterSections}</div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
