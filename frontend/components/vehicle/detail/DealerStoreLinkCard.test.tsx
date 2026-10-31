// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import DealerStoreLinkCard from "./DealerStoreLinkCard";
import type { SellerDealer } from "@/lib/vehicle/public-vehicle";

vi.mock("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  ),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    "aria-label"?: string;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const seller: SellerDealer = {
  type: "dealer",
  name: "Ittmotors",
  logo: "/api/vehicle-images?key=dealers%2Flogo.webp",
  address: "Atibaia (SP)",
  storeSlug: "ittmotors-122",
};

afterEach(cleanup);

describe("card de acesso ao perfil público da loja", () => {
  it("usa nome, logo real, cidade e rota canônica da loja", () => {
    render(<DealerStoreLinkCard seller={seller} city="Atibaia (SP)" />);

    expect(screen.getByText("Loja anunciante")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Logotipo da Ittmotors" }).getAttribute("src")).toBe(
      seller.logo
    );
    expect(screen.getByText("Atibaia (SP)")).toBeTruthy();
    expect(screen.getByText("Loja / Revenda")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Ver página da loja Ittmotors" }).getAttribute("href")
    ).toBe("/lojas/ittmotors-122");
    expect(screen.getByText(/estoque completo e outras ofertas/i)).toBeTruthy();
  });

  it("usa iniciais quando não existe logotipo, sem inventar imagem", () => {
    render(<DealerStoreLinkCard seller={{ ...seller, logo: "" }} city="Atibaia (SP)" />);
    expect(screen.queryByRole("img", { name: /Logotipo da/ })).toBeNull();
    expect(screen.getByLabelText("Iniciais da Ittmotors")).toBeTruthy();
  });

  it("não apresenta um link falso quando falta slug válido", () => {
    render(
      <DealerStoreLinkCard seller={{ ...seller, storeSlug: "", logo: "" }} city="" />
    );
    expect(screen.queryByRole("link", { name: /Ver página da loja/i })).toBeNull();
    expect(screen.getByText(/Perfil público da loja indisponível/i)).toBeTruthy();
  });
});
