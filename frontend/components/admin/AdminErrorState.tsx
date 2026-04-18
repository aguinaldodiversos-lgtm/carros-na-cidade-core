export function AdminErrorState({
  message = "Erro ao carregar dados",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <svg viewBox="0 0 24 24" className="h-10 w-10 text-cnc-danger/50" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
      </svg>
      <p className="mt-3 text-sm text-cnc-muted">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-strong transition-colors"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
