import type { OptionGroup } from "@/lib/ads/vehicle-options";

/**
 * Renderiza os opcionais selecionados pelo anunciante agrupados por categoria
 * (Conforto / Dirigibilidade / Segurança), com ícone de check. Categorias
 * vazias nunca chegam aqui (filtradas em `buildSelectedOptionGroups`).
 *
 * Usado no detalhe público (desktop dentro de um Card; mobile no shell).
 * Os labels são canônicos (texto puro do catálogo) — nunca renderiza texto
 * arbitrário vindo do cliente.
 */
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="mt-0.5 h-4 w-4 shrink-0 text-cnc-success"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16.7 5.7 8.5 13.9l-3.2-3.2"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type VehicleOptionsGroupsProps = {
  groups: OptionGroup[];
  /** 2 = duas colunas no desktop (padrão); 1 = sempre uma coluna. */
  columns?: 1 | 2;
};

export default function VehicleOptionsGroups({ groups, columns = 2 }: VehicleOptionsGroupsProps) {
  if (!groups || groups.length === 0) return null;

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.category}>
          <h4 className="text-[13px] font-bold uppercase tracking-wideish text-cnc-muted">
            {group.label}
          </h4>
          <ul
            className={`mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 ${
              columns === 2 ? "sm:grid-cols-2" : ""
            }`}
          >
            {group.items.map((item) => (
              <li
                key={item.key}
                className="flex items-start gap-2 text-[13px] leading-snug text-cnc-text"
              >
                <CheckIcon />
                <span className="min-w-0">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
