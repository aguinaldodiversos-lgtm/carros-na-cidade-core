export function AdminEmptyState({ message = "Nenhum dado encontrado" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <svg viewBox="0 0 24 24" className="h-10 w-10 text-cnc-muted-soft/40" fill="currentColor">
        <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" />
      </svg>
      <p className="mt-3 text-sm text-cnc-muted-soft">{message}</p>
    </div>
  );
}
