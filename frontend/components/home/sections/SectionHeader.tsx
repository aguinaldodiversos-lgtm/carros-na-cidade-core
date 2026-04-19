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
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eef1f9] text-[#2d3a9c]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-[22px] font-extrabold leading-tight tracking-tight text-[#1a1f36] md:text-[24px]">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-[13.5px] leading-relaxed text-[#5b6079]">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {link ? (
        <Link
          href={link.href}
          className="inline-flex items-center gap-1.5 self-start text-[13.5px] font-bold text-[#2d3a9c] transition hover:text-[#1f2b7e] sm:self-end"
        >
          {link.label}
          <IconArrowUpRight className="h-4 w-4" />
        </Link>
      ) : null}
    </header>
  );
}
