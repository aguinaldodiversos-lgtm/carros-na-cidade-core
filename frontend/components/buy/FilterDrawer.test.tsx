// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";

import { FilterDrawer } from "./FilterDrawer";

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Filtros
      </button>
      <FilterDrawer
        id="gaveta"
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        title="Filtros"
        returnFocusRef={triggerRef}
      >
        <label htmlFor="campo">Preço</label>
        <select id="campo">
          <option>Qualquer</option>
        </select>
        <button type="button">Ver 6 ofertas</button>
      </FilterDrawer>
    </>
  );
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("FilterDrawer — gaveta de filtros acessível", () => {
  it("fechada não existe no DOM", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("aberta: dialog modal com título, foco no Fechar e página travada", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));

    const dialog = screen.getByRole("dialog", { name: "Filtros" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.id).toBe("gaveta");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Fechar" }));
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("Esc fecha, devolve o foco a quem abriu e destrava a página", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const trigger = screen.getByRole("button", { name: "Filtros" });
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });

  it("botão Fechar fecha", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
