import Link from "next/link";
import type { ReactNode } from "react";

import { IconArrowUpRight } from "@/components/home/icons";

interface SectionHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  link?: { label: string; href: string };
}

export function SectionHeader({ icon, title, subtitle, link }: SectionHeaderProps) {
  return (
    <header className="mb-4 flex flex-col gap-2.5 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
      <div className="flex items-start gap-2.5 sm:gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eef1f9] text-[#2d3a9c] sm:h-11 sm:w-11 sm:rounded-[12px]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-[18px] font-extrabold leading-tight tracking-tight text-[#1a1f36] sm:text-[22px] md:text-[24px]">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#5b6079] sm:mt-1 sm:text-[13.5px]">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {link ? (
        <Link
          href={link.href}
          className="inline-flex items-center gap-1.5 self-start text-[12.5px] font-bold text-[#2d3a9c] transition hover:text-[#1f2b7e] sm:self-end sm:text-[13.5px]"
        >
          {link.label}
          <IconArrowUpRight className="h-4 w-4" />
        </Link>
      ) : null}
    </header>
  );
}
