"use client";

import { useState } from "react";
import { clearClientAuthArtifacts } from "@/lib/auth/client-session-reset";

type AccountLogoutButtonProps = {
  className?: string;
};

export function AccountLogoutButton({ className }: AccountLogoutButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      clearClientAuthArtifacts();
      // Hard navigation: clears all Next.js Router Cache, React state, and
      // in-memory component data so no previous user's data bleeds into the
      // next session.
      window.location.assign("/");
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className={className}
    >
      {busy ? "Saindo..." : "Sair"}
    </button>
  );
}
