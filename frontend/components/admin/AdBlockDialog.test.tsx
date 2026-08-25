// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdBlockDialog } from "./AdBlockDialog";

/**
 * Fase 4.10A — modal de bloqueio administrativo.
 *
 * O que precisa ser verdade na tela:
 *   1. o motivo NÃO vem pré-selecionado (um clique distraído não pode gravar
 *      "Informação incorreta" numa trilha permanente);
 *   2. sem motivo, o confirm não dispara;
 *   3. "Outro motivo" exige descrição;
 *   4. o texto avisa que o efeito é imediato nas áreas públicas;
 *   5. erro do backend aparece na tela em vez de sumir.
 */

afterEach(cleanup);

function setup(onConfirm = vi.fn().mockResolvedValue(undefined)) {
  const onCancel = vi.fn();
  render(
    <AdBlockDialog adId={42} adTitle="Honda Civic 2020" onConfirm={onConfirm} onCancel={onCancel} />
  );
  return { onConfirm, onCancel };
}

function confirmButton() {
  return screen.getByRole("button", { name: /bloquear anúncio/i });
}

describe("AdBlockDialog — motivo", () => {
  it("abre sem motivo pré-selecionado", () => {
    setup();
    const select = screen.getByTestId("block-reason-select") as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("oferece os oito motivos da especificação", () => {
    setup();
    const select = screen.getByTestId("block-reason-select") as HTMLSelectElement;
    // 8 motivos + o placeholder "Selecione um motivo…"
    expect(select.options).toHaveLength(9);
    expect(screen.getByRole("option", { name: "Informação incorreta" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Possível fraude" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Veículo possivelmente indisponível" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Preço ou condição enganosa" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Fotos inadequadas ou incompatíveis" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Anúncio duplicado" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Violação dos termos de uso" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Outro motivo" })).toBeTruthy();
  });

  it("sem motivo escolhido, o confirm fica desabilitado e nada é enviado", async () => {
    const { onConfirm } = setup();

    expect(confirmButton()).toHaveProperty("disabled", true);
    fireEvent.click(confirmButton());

    await waitFor(() => expect(onConfirm).not.toHaveBeenCalled());
    expect(screen.getByRole("alert").textContent).toMatch(/escolha um motivo/i);
  });

  it("com motivo simples, confirma sem exigir descrição", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await user.selectOptions(screen.getByTestId("block-reason-select"), "suspected_fraud");
    expect(confirmButton()).toHaveProperty("disabled", false);

    await user.click(confirmButton());

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("suspected_fraud", ""));
  });

  it('"Outro motivo" exige descrição — confirm segue travado até haver texto', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await user.selectOptions(screen.getByTestId("block-reason-select"), "other");
    expect(confirmButton()).toHaveProperty("disabled", true);

    await user.type(screen.getByRole("textbox"), "placa divergente do documento");
    expect(confirmButton()).toHaveProperty("disabled", false);

    await user.click(confirmButton());
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith("other", "placa divergente do documento")
    );
  });

  it("a observação é opcional nos demais motivos", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await user.selectOptions(screen.getByTestId("block-reason-select"), "invalid_photos");
    await user.type(screen.getByRole("textbox"), "fotos de outro veículo");
    await user.click(confirmButton());

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith("invalid_photos", "fotos de outro veículo")
    );
  });
});

describe("AdBlockDialog — texto e estados", () => {
  it("avisa que o efeito público é imediato", () => {
    setup();
    expect(screen.getByText(/deixará de aparecer imediatamente nas áreas públicas/i)).toBeTruthy();
  });

  it("identifica o anúncio sendo bloqueado", () => {
    setup();
    expect(screen.getByText(/#42 — Honda Civic 2020/)).toBeTruthy();
  });

  it("mostra estado de processamento e evita duplo envio", async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    setup(onConfirm);

    await user.selectOptions(screen.getByTestId("block-reason-select"), "duplicate_ad");
    await user.click(confirmButton());

    await waitFor(() => expect(screen.getByRole("button", { name: /processando/i })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /processando/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    resolve();
  });

  it("mostra a mensagem de erro do backend em vez de engoli-la", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(new Error("Motivo de bloqueio inválido."));
    setup(onConfirm);

    await user.selectOptions(screen.getByTestId("block-reason-select"), "terms_violation");
    await user.click(confirmButton());

    await waitFor(() => expect(screen.getByText(/Motivo de bloqueio inválido\./)).toBeTruthy());
  });

  it("cancelar não bloqueia nada", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();

    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
