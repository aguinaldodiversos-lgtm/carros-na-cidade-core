export function AdminLoadingState({ message = "Carregando…" }: { message?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="text-sm text-cnc-muted">{message}</span>
    </div>
  );
}
