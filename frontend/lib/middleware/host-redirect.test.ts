import { describe, expect, it } from "vitest";
import { CANONICAL_HOST, decideHostRedirect } from "./host-redirect";

describe("decideHostRedirect — hosts onrender.com → canônico", () => {
  it("hosts onrender redirecionam para www.carrosnacidade.com com path preservado", () => {
    const out = decideHostRedirect(
      "carros-na-cidade-portal.onrender.com",
      "/comprar/estado/sp",
      "?page=2"
    );
    expect(out.kind).toBe("redirect");
    if (out.kind === "redirect") {
      expect(out.target).toBe(`https://${CANONICAL_HOST}/comprar/estado/sp?page=2`);
    }
  });

  it("hosts onrender com porta também são detectados", () => {
    const out = decideHostRedirect(
      "carros-na-cidade-portal.onrender.com:443",
      "/blog",
      ""
    );
    expect(out.kind).toBe("redirect");
  });

  it("host onrender em maiúsculas é detectado (case-insensitive)", () => {
    const out = decideHostRedirect("FOO.ONRENDER.COM", "/anuncios", "");
    expect(out.kind).toBe("redirect");
  });

  it("preserva querystring vazia sem adicionar '?'", () => {
    const out = decideHostRedirect("x.onrender.com", "/blog", "");
    if (out.kind === "redirect") {
      expect(out.target).toBe(`https://${CANONICAL_HOST}/blog`);
    }
  });
});

describe("decideHostRedirect — exceções (healthcheck do Render)", () => {
  it("pathname='/' NÃO redireciona (Render usa raiz como healthcheck)", () => {
    const out = decideHostRedirect(
      "carros-na-cidade-portal.onrender.com",
      "/",
      ""
    );
    expect(out.kind).toBe("pass");
  });

  it("/healthcheck NÃO redireciona", () => {
    const out = decideHostRedirect("x.onrender.com", "/healthcheck", "");
    expect(out.kind).toBe("pass");
  });

  it("/api/healthcheck NÃO redireciona", () => {
    const out = decideHostRedirect("x.onrender.com", "/api/healthcheck", "");
    expect(out.kind).toBe("pass");
  });
});

describe("decideHostRedirect — anti-loop", () => {
  it("host canônico www.carrosnacidade.com NÃO redireciona", () => {
    expect(decideHostRedirect(CANONICAL_HOST, "/", "").kind).toBe("pass");
    expect(decideHostRedirect(CANONICAL_HOST, "/comprar/estado/sp", "").kind).toBe("pass");
  });

  it("host apex carrosnacidade.com NÃO redireciona", () => {
    expect(decideHostRedirect("carrosnacidade.com", "/comprar/estado/sp", "").kind).toBe("pass");
  });

  it("host vazio/nulo NÃO redireciona (defesa)", () => {
    expect(decideHostRedirect(null, "/", "").kind).toBe("pass");
    expect(decideHostRedirect("", "/", "").kind).toBe("pass");
    expect(decideHostRedirect(undefined, "/", "").kind).toBe("pass");
  });

  it("hosts não-onrender (ex.: localhost, IP) NÃO redirecionam", () => {
    expect(decideHostRedirect("localhost:3000", "/", "").kind).toBe("pass");
    expect(decideHostRedirect("127.0.0.1", "/", "").kind).toBe("pass");
    expect(decideHostRedirect("example.com", "/", "").kind).toBe("pass");
  });
});
