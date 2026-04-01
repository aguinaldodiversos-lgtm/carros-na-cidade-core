"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearClientAuthArtifacts } from "@/lib/auth/client-session-reset";

type AccountLogoutButtonProps = {
  className?: string;
};

export function AccountLogoutButton({ className }: AccountLogoutButtonProps) {
  const router = useRouter();
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
      router.push("/");
      router.refresh();
    } finally {
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
