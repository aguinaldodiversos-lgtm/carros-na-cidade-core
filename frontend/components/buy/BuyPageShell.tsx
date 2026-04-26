import type { ReactNode } from "react";

type BuyPageShellProps = {
  children: ReactNode;
  /** Mobile drawer trigger — botão fixo para abrir filtros */
  mobileFilterTrigger?: ReactNode;
};

export function BuyPageShell({ children, mobileFilterTrigger }: BuyPageShellProps) {
  return (
    <div className="min-h-screen bg-cnc-bg pb-20 md:pb-0">
      {children}
      {mobileFilterTrigger}
    </div>
  );
}
