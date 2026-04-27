"use client";

import { STEP_COUNT, STEP_LABELS } from "./types";

type Props = {
  currentStep: number;
};

export default function SellWizardProgress({ currentStep }: Props) {
  return (
    <div className="w-full overflow-x-auto border-b border-cnc-line bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex min-w-[480px] max-w-[1100px] items-stretch justify-between gap-1 px-4 py-4 sm:px-6">
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
                      ? "bg-primary text-white shadow-card"
                      : done
                        ? "bg-primary-soft text-primary"
                        : "border border-cnc-line bg-cnc-surface text-cnc-muted"
                  }`}
                >
                  {index + 1}
                </span>
                <span
                  className={`line-clamp-2 text-[11px] font-bold leading-tight sm:text-xs ${
                    active ? "text-cnc-text-strong" : "text-cnc-muted"
                  }`}
                >
                  {STEP_LABELS[index]}
                </span>
                <span
                  className={`h-1 w-full max-w-[72px] rounded-full ${
                    active ? "bg-primary" : done ? "bg-primary/40" : "bg-cnc-line"
                  }`}
                />
              </div>
              {index < STEP_COUNT - 1 ? (
                <span className="mb-6 hidden text-cnc-line-strong sm:inline" aria-hidden>
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
