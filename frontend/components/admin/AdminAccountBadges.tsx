import type { AdminAccountType } from "@/lib/admin/api";

/**
 * Badges de CONTA (tipo e papel) — Admin U1.
 *
 * Por que não reutilizar `AdminStatusBadge`: aquele componente mapeia STATUS de
 * domínio (anúncio, anunciante, pagamento, denúncia, chamado). O vocabulário
 * aqui é outro — tipo de conta e papel — e a colisão não é hipotética: a chave
 * `pending` já existe naquele MAP significando "pagamento pendente" (âmbar).
 * Reaproveitá-la faria uma conta sem documento informado ser pintada com a cor
 * de uma cobrança em aberto, e um dia alguém "corrigiria" o rótulo de um dos
 * dois quebrando o outro.
 *
 * Nenhum destes badges representa "status do usuário": `users` não tem coluna
 * de status, e inventar um "Ativo" seria exibir um dado que o banco não guarda.
 */

const ACCOUNT_TYPE_MAP: Record<AdminAccountType, { bg: string; text: string; label: string }> = {
  CPF: { bg: "bg-sky-100", text: "text-sky-700", label: "Pessoa física" },
  CNPJ: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Lojista" },
  pending: { bg: "bg-gray-200", text: "text-gray-600", label: "Pendente" },
};

export function AdminAccountTypeBadge({ accountType }: { accountType: AdminAccountType }) {
  const s = ACCOUNT_TYPE_MAP[accountType] ?? ACCOUNT_TYPE_MAP.pending;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}

/**
 * Papel administrativo. Admins vivem na MESMA tabela `users` e devem aparecer
 * na listagem: esconder contas privilegiadas tornaria a auditoria de quem tem
 * acesso ao painel impossível pela própria ferramenta de auditoria.
 */
export function AdminRoleBadge({ role }: { role: string }) {
  const isAdmin = role === "admin";
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        isAdmin ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {isAdmin ? "Admin" : "Usuário"}
    </span>
  );
}
