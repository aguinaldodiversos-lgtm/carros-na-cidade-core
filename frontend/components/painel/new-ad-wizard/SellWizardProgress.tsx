"use client";

import { STEP_COUNT, STEP_LABELS } from "./types";

type Props = {
  currentStep: number;
};

export default function SellWizardProgress({ currentStep }: Props) {
  return (
    <div className="w-full overflow-x-auto border-b border-[#E5E9F2] bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex min-w-[720px] max-w-[1100px] items-stretch justify-between gap-1 px-4 py-4 sm:px-6">
        {Array.from({ length: STEP_COUNT }, (_, index) => {
          const active = index === currentStep;
          const done = index < currentStep;
          return (
            <div key={STEP_LABELS[index]} className="flex min-w-0 flex-1 items-center gap-1">
              <div
                className={`flex min-w-0 flex-1 flex-col items-center gap-2 text-center ${
                  active ? "opacity-100" : done ? "opacity-90" : "opacity-55"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                    active
                      ? "bg-[#2F67F6] text-white shadow-[0_8px_20px_rgba(47,103,246,0.35)]"
                      : done
                        ? "bg-[#E8F0FF] text-[#2F67F6]"
                        : "bg-[#F0F3FA] text-[#6E748A]"
                  }`}
                >
                  {index + 1}
                </span>
                <span
                  className={`line-clamp-2 text-[11px] font-bold leading-tight sm:text-xs ${
                    active ? "text-[#1D2440]" : "text-[#6E748A]"
                  }`}
                >
                  {STEP_LABELS[index]}
                </span>
                <span
                  className={`h-1 w-full max-w-[72px] rounded-full ${
                    active ? "bg-[#2F67F6]" : done ? "bg-[#C7D7F8]" : "bg-[#E5E9F2]"
                  }`}
                />
              </div>
              {index < STEP_COUNT - 1 ? (
                <span className="mb-6 hidden text-[#C5D1E8] sm:inline" aria-hidden>
                  ›
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
