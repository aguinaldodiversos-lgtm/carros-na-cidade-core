// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { AdModerationHistory } from "./AdModerationHistory";
import type { AdModerationEvent } from "@/lib/admin/api";

afterEach(cleanup);

const BLOCK_EVENT: AdModerationEvent = {
  id: 2,
  event_type: "admin_blocked",
  from_status: "active",
  to_status: "blocked",
  reason_code: "suspected_fraud",
  note: null,
  created_at: "2026-08-25T13:32:00.000Z",
};

const UNBLOCK_EVENT: AdModerationEvent = {
  id: 3,
  event_type: "admin_unblocked",
  from_status: "blocked",
  to_status: "paused",
  reason_code: null,
  note: null,
  created_at: "2026-08-25T17:10:00.000Z",
};

describe("AdModerationHistory", () => {
  it("mostra vazio quando não há moderação", () => {
    render(<AdModerationHistory events={[]} />);
    expect(screen.getByTestId("moderation-history-empty")).toBeTruthy();
  });

  it("lista bloqueio e reativação como DUAS entradas", () => {
    render(<AdModerationHistory events={[UNBLOCK_EVENT, BLOCK_EVENT]} />);

    const items = screen.getByTestId("moderation-history-list").querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(screen.getByText("Anúncio bloqueado")).toBeTruthy();
    expect(screen.getByText("Anúncio reativado")).toBeTruthy();
  });

  it("traduz o código do motivo no rótulo do admin", () => {
    render(<AdModerationHistory events={[BLOCK_EVENT]} />);
    expect(screen.getByText(/Motivo: Possível fraude/)).toBeTruthy();
    // O código cru não vai para a tela.
    expect(screen.queryByText(/suspected_fraud/)).toBeNull();
  });

  it("mostra para qual estado o anúncio foi restaurado", () => {
    render(<AdModerationHistory events={[UNBLOCK_EVENT]} />);
    expect(screen.getByText(/Restaurado para: paused/)).toBeTruthy();
  });

  it("exibe a observação administrativa quando existe", () => {
    render(
      <AdModerationHistory
        events={[{ ...BLOCK_EVENT, reason_code: "other", note: "documento divergente" }]}
      />
    );
    expect(screen.getByText(/Observação: documento divergente/)).toBeTruthy();
  });

  it("nunca renderiza a identidade de quem moderou", () => {
    // O DTO do backend não traz `actor_user_id`; mesmo que trouxesse por
    // engano, o componente não tem por onde exibi-lo.
    const contaminated = {
      ...BLOCK_EVENT,
      actor_user_id: "admin-1",
      actor_role: "admin",
    } as AdModerationEvent;

    const { container } = render(<AdModerationHistory events={[contaminated]} />);

    expect(container.textContent).not.toMatch(/admin-1/);
  });

  it("mostra estado de carregamento", () => {
    render(<AdModerationHistory events={[]} loading />);
    expect(screen.getByText(/carregando/i)).toBeTruthy();
  });
});
