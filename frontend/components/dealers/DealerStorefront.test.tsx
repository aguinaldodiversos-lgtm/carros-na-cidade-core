// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import DealerStorefront from "./DealerStorefront";
import type { PublicDealer } from "@/lib/dealers/fetch-public-dealer";

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("@/components/ads/AdCard", () => ({
  AdCard: ({ ad }: { ad: { title?: string } }) => <article>{ad.title}</article>,
}));

const baseDealer: PublicDealer = {
  id: 64,
  slug: "loja-teste",
  name: "Loja Teste",
  verified: false,
  coverUrl: "/api/vehicle-images?key=cover",
  logoUrl: "/api/vehicle-images?key=logo",
  description: "Atendimento especializado em veículos seminovos.",
  address: "Rua Comercial, 100",
  phone: "1144149804",
  whatsapp: "11987654321",
  businessHours: null,
  city: "Atibaia",
  state: "SP",
  citySlug: "atibaia-sp",
  totalActiveAds: 0,
};

afterEach(cleanup);

describe("perfil público da loja — layout premium", () => {
  it("renderiza apenas contatos reais, sem mapa nem avaliações fictícias", () => {
    render(<DealerStorefront dealer={baseDealer} ads={[]} reviews={[]} />);
    expect(screen.getByText("Rua Comercial, 100")).toBeTruthy();
    expect(screen.getByText("(11) 4414-9804")).toBeTruthy();
    expect(screen.getByText("(11) 98765-4321")).toBeTruthy();
    expect(screen.queryByText(/Google Maps|Como chegar|CNPJ verificado/)).toBeNull();
    expect(screen.getByText(/ainda não recebeu avaliações públicas/i)).toBeTruthy();
    expect(screen.queryByText(/4,8|24 avaliações/)).toBeNull();
    expect(screen.getByRole("link", { name: /Ver estoque da loja/i }).getAttribute("href")).toBe(
      "#estoque"
    );
  });

  it("não exibe horários ou telefones inventados e mantém a navegação", () => {
    render(
      <DealerStorefront
        dealer={{ ...baseDealer, address: null, phone: null, whatsapp: null, businessHours: null }}
        ads={[]}
        reviews={[]}
      />
    );
    expect(screen.getByText(/a loja ainda não informou seus dados de contato/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /chamar no whatsapp/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Sobre a loja" }).getAttribute("href")).toBe("#sobre");
    expect(screen.getByRole("link", { name: "Avaliações" }).getAttribute("href")).toBe(
      "#avaliacoes"
    );
  });
});
