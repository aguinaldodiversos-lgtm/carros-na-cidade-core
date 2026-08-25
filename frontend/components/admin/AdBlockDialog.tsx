"use client";

import { useState } from "react";
import { AdminActionDialog } from "./AdminActionDialog";
import {
  AD_BLOCK_REASONS,
  requiresNote,
  type AdBlockReasonCode,
} from "@/lib/moderation/ad-block-reasons";

type Props = {
  adId: string | number;
  adTitle: string;
  onConfirm: (reasonCode: AdBlockReasonCode, note: string) => Promise<unknown>;
  onCancel: () => void;
};

/**
 * Modal de bloqueio administrativo (Fase 4.10A).
 *
 * Reaproveita o `AdminActionDialog` (mesmo visual, mesmo estado de "Processando…",
 * mesma exibição de erro que as outras ações do painel) e acrescenta apenas o
 * seletor de motivo no slot `extra`.
 *
 * O motivo começa VAZIO de propósito. Pré-selecionar o primeiro da lista faria
 * um clique distraído registrar "Informação incorreta" numa trilha de auditoria
 * permanente — o admin tem de escolher.
 */
export function AdBlockDialog({ adId, adTitle, onConfirm, onCancel }: Props) {
  const [reasonCode, setReasonCode] = useState<AdBlockReasonCode | "">("");

  const noteRequired = reasonCode !== "" && requiresNote(reasonCode);

  return (
    <AdminActionDialog
      open
      title="Bloquear anúncio"
      description={`Anúncio #${adId} — ${adTitle}`}
      confirmLabel="Bloquear anúncio"
      confirmColor="danger"
      showReason
      // A observação só é obrigatória em "Outro motivo" — é isso que
      // `requireReason` comunica ao admin ("Motivo obrigatório." sob o campo).
      requireReason={noteRequired}
      // Já a falta de MOTIVO trava o confirm por outro caminho: usar
      // `requireReason` aqui exibiria "Motivo obrigatório." embaixo de um
      // campo rotulado "(opcional)" — o oposto do que vale.
      confirmDisabled={reasonCode === ""}
      reasonPlaceholder={
        noteRequired
          ? "Descreva o motivo (obrigatório)"
          : "Observação administrativa (opcional, uso interno)"
      }
      extra={
        <div className="space-y-2">
          <p className="text-xs text-cnc-muted">
            Este anúncio deixará de aparecer imediatamente nas áreas públicas do portal.
          </p>
          <label className="block text-xs font-medium text-cnc-muted">
            <span className="mb-1 block">Motivo do bloqueio</span>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as AdBlockReasonCode | "")}
              data-testid="block-reason-select"
              aria-label="Motivo do bloqueio"
              required
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            >
              <option value="">Selecione um motivo…</option>
              {AD_BLOCK_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.adminLabel}
                </option>
              ))}
            </select>
          </label>
          {reasonCode === "" && (
            <p className="text-xs text-cnc-danger" role="alert">
              Escolha um motivo para continuar.
            </p>
          )}
        </div>
      }
      onConfirm={async (note) => {
        // Defesa em profundidade: o confirm já fica desabilitado sem motivo,
        // mas um caminho alternativo (Enter, teste, mudança futura no dialog)
        // não pode disparar um bloqueio sem código.
        if (reasonCode === "") {
          throw new Error("Escolha um motivo para bloquear o anúncio.");
        }
        return onConfirm(reasonCode, note);
      }}
      onCancel={onCancel}
    />
  );
}
