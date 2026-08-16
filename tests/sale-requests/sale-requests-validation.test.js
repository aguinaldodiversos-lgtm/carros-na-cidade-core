// Validação de entrada das solicitações de venda — testes PUROS (sem I/O).
//
// O foco não é "a função rejeita lixo": é que ela rejeita o lixo ESPECÍFICO que
// causaria dano se passasse. Cada bloco abaixo corresponde a um item do §36 da
// especificação da fase.

import { describe, expect, it } from "vitest";

import {
  decodeCursor,
  encodeCursor,
  parseCityId,
  parseLimit,
  parseSaleRequestId,
  validateBrand,
  validateDeclaredCondition,
  validateFipeModelDescription,
  validateKnownIssues,
  validateMileage,
  validateNewSaleRequest,
  validatePhotoKeys,
  validateTransmission,
  validateYear,
} from "../../src/modules/sale-requests/sale-requests.validation.js";
import {
  SALE_REQUEST_LIMITS,
  SALE_REQUEST_PAGE,
  SALE_REQUEST_PHOTOS,
  maxModelYear,
} from "../../src/modules/sale-requests/sale-requests.constants.js";

const OWNER = "7";

function keysFor(count, { owner = OWNER, session = "sess" } = {}) {
  return Array.from(
    { length: count },
    (_, index) => `sale-requests/${owner}/${session}/2026/08/uuid-${index}.webp`
  );
}

describe("marca — canonicalização pelo servidor", () => {
  it("remove o prefixo de grupo da FIPE", () => {
    expect(validateBrand("VW - VolksWagen")).toEqual({
      brand: "Volkswagen",
      brandSlug: "volkswagen",
    });
  });

  it("recusa marca vazia", () => {
    expect(() => validateBrand("   ")).toThrowError(/marca/i);
  });

  it("recusa marca acima do limite", () => {
    expect(() => validateBrand("x".repeat(SALE_REQUEST_LIMITS.BRAND_MAX + 1))).toThrowError(
      /máximo/i
    );
  });
});

describe("modelo — guarda a descrição FIPE E deriva o comercial", () => {
  it("mantém a versão na descrição e reduz o rótulo comercial", () => {
    const result = validateFipeModelDescription("T-Cross 200 TSI 1.0 Flex 12V 5p Aut.", {
      brand: "VW - VolksWagen",
    });

    // A descrição INTEIRA sobrevive: é ela que carrega a versão, e é ela que o
    // lojista precisa para avaliar o carro.
    expect(result.fipeModelDescription).toBe("T-Cross 200 TSI 1.0 Flex 12V 5p Aut.");
    expect(result.model).toBe("T-Cross");
    expect(result.modelSlug).toBe("t-cross");
  });

  it("deriva modelo de cabeça numérica quando a marca acompanha", () => {
    // "5 Luxury 1.5 TB FWD" só vira "Omoda 5" porque a marca chega junto — é o
    // caso que quebra qualquer heurística de `split(" ")[0]`.
    const result = validateFipeModelDescription("5 Luxury 1.5 TB FWD", { brand: "Omoda" });
    expect(result.model).toBe("Omoda 5");
  });

  it("recusa descrição vazia", () => {
    expect(() => validateFipeModelDescription("", { brand: "Honda" })).toThrowError(/modelo/i);
  });
});

describe("ano", () => {
  const now = new Date("2026-08-16T12:00:00.000Z");

  it("aceita o ano-modelo do próximo ano civil", () => {
    expect(validateYear(String(maxModelYear(now)), { now })).toBe(2027);
  });

  it("recusa o ano seguinte ao teto", () => {
    expect(() => validateYear(String(maxModelYear(now) + 1), { now })).toThrowError(/ano/i);
  });

  it("recusa ano anterior ao piso", () => {
    expect(() => validateYear("1949", { now })).toThrowError(/ano/i);
  });

  it("recusa ano com menos de 4 dígitos", () => {
    expect(() => validateYear("21", { now })).toThrowError(/4 dígitos/i);
  });

  it("recusa texto com prefixo numérico", () => {
    // `Number.parseInt` sozinho leria "2020" de "2020abc" e aceitaria o valor.
    expect(() => validateYear("2020abc", { now })).toThrowError(/4 dígitos/i);
  });
});

describe("quilometragem", () => {
  it("aceita zero (carro 0 km)", () => {
    expect(validateMileage(0)).toBe(0);
  });

  it("recusa negativo", () => {
    expect(() => validateMileage(-1)).toThrowError(/quilometragem/i);
  });

  it("recusa valor acima do teto de sanidade", () => {
    expect(() => validateMileage(SALE_REQUEST_LIMITS.MILEAGE_MAX + 1)).toThrowError(/máximo/i);
  });

  it("recusa separador de milhar", () => {
    expect(() => validateMileage("45.000")).toThrowError(/números/i);
  });
});

describe("condição declarada — allowlist fechada", () => {
  it("aceita os quatro valores do vocabulário", () => {
    for (const value of ["excelente", "bom", "regular", "precisa_reparos"]) {
      expect(validateDeclaredCondition(value)).toBe(value);
    }
  });

  it("recusa valor fora do vocabulário", () => {
    expect(() => validateDeclaredCondition("ótimo")).toThrowError(/conservação/i);
  });
});

describe("problemas conhecidos", () => {
  it("é opcional e normaliza ausência para null", () => {
    // Um campo opcional tem UM jeito de estar ausente. Sem isso, metade das
    // linhas teria NULL e a outra metade string vazia.
    expect(validateKnownIssues(undefined)).toBeNull();
    expect(validateKnownIssues(null)).toBeNull();
    expect(validateKnownIssues("   ")).toBeNull();
  });

  it("aceita exatamente o limite", () => {
    const text = "a".repeat(SALE_REQUEST_LIMITS.KNOWN_ISSUES_MAX);
    expect(validateKnownIssues(text)).toBe(text);
  });

  it("recusa acima de 1000 caracteres", () => {
    expect(() =>
      validateKnownIssues("a".repeat(SALE_REQUEST_LIMITS.KNOWN_ISSUES_MAX + 1))
    ).toThrowError(/máximo/i);
  });
});

describe("cidade", () => {
  it("aceita id numérico positivo", () => {
    expect(parseCityId("42")).toBe(42);
  });

  it("recusa ausência com código próprio", () => {
    // Código próprio (e não INVALID_FIELD) porque o frontend precisa distinguir
    // "escolha a cidade" de um erro genérico de campo.
    expect(() => parseCityId("")).toThrowError(/cidade/i);
    try {
      parseCityId("");
    } catch (error) {
      expect(error.details?.code).toBe("SALE_REQUEST_CITY_REQUIRED");
    }
  });

  it("recusa texto", () => {
    expect(() => parseCityId("atibaia")).toThrowError(/cidade/i);
  });
});

describe("id da rota", () => {
  it("recusa id não numérico com 404, não 400", () => {
    // 400 confirmaria o formato da chave para quem está sondando.
    try {
      parseSaleRequestId("abc");
      throw new Error("deveria ter lançado");
    } catch (error) {
      expect(error.statusCode).toBe(404);
    }
  });

  it("recusa prefixo numérico seguido de texto", () => {
    expect(() => parseSaleRequestId("12abc")).toThrowError(/não encontrada/i);
  });
});

describe("fotos — quantidade, forma e POSSE", () => {
  it("aceita o mínimo e o máximo", () => {
    expect(validatePhotoKeys(keysFor(SALE_REQUEST_PHOTOS.MIN), { ownerUserId: OWNER })).toHaveLength(
      SALE_REQUEST_PHOTOS.MIN
    );
    expect(validatePhotoKeys(keysFor(SALE_REQUEST_PHOTOS.MAX), { ownerUserId: OWNER })).toHaveLength(
      SALE_REQUEST_PHOTOS.MAX
    );
  });

  it("recusa abaixo do mínimo", () => {
    expect(() =>
      validatePhotoKeys(keysFor(SALE_REQUEST_PHOTOS.MIN - 1), { ownerUserId: OWNER })
    ).toThrowError(/pelo menos/i);
  });

  it("recusa acima do máximo", () => {
    expect(() =>
      validatePhotoKeys(keysFor(SALE_REQUEST_PHOTOS.MAX + 1), { ownerUserId: OWNER })
    ).toThrowError(/no máximo/i);
  });

  it("atribui sort_order pela posição — índice 0 é a capa", () => {
    const photos = validatePhotoKeys(keysFor(4), { ownerUserId: OWNER });
    expect(photos.map((photo) => photo.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it("aceita tanto string crua quanto objeto { storage_key }", () => {
    const raw = keysFor(4);
    const asObjects = raw.map((storage_key) => ({ storage_key }));
    expect(validatePhotoKeys(asObjects, { ownerUserId: OWNER })).toEqual(
      validatePhotoKeys(raw, { ownerUserId: OWNER })
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POSSE — o ataque que esta validação existe para impedir
  // ─────────────────────────────────────────────────────────────────────────
  it("recusa chave da pasta de OUTRO usuário", () => {
    const stolen = keysFor(4, { owner: "999" });
    expect(() => validatePhotoKeys(stolen, { ownerUserId: OWNER })).toThrowError(/foto inválida/i);
  });

  it("recusa mistura de chave própria com chave alheia", () => {
    const mixed = [...keysFor(3), `sale-requests/999/sess/2026/08/uuid-x.webp`];
    expect(() => validatePhotoKeys(mixed, { ownerUserId: OWNER })).toThrowError(/foto inválida/i);
  });

  it("recusa prefixo que apenas COMEÇA com o id do dono", () => {
    // `sale-requests/77/...` não pode passar para o usuário 7. Sem a barra final
    // no prefixo esperado, `startsWith("sale-requests/7")` aceitaria o usuário 77.
    const neighbour = [`sale-requests/77/sess/2026/08/uuid-0.webp`, ...keysFor(3)];
    expect(() => validatePhotoKeys(neighbour, { ownerUserId: OWNER })).toThrowError(
      /foto inválida/i
    );
  });

  it("recusa traversal, mesmo dentro da própria pasta", () => {
    const traversal = [`sale-requests/${OWNER}/../999/sess/2026/08/uuid-0.webp`, ...keysFor(3)];
    expect(() => validatePhotoKeys(traversal, { ownerUserId: OWNER })).toThrowError(
      /foto inválida/i
    );
  });

  it("recusa URL absoluta e esquemas perigosos", () => {
    for (const bad of [
      "https://evil.example/foto.webp",
      "data:image/webp;base64,AAAA",
      "//evil.example/foto.webp",
      "sale-requests\\7\\sess\\foto.webp",
    ]) {
      expect(() => validatePhotoKeys([bad, ...keysFor(3)], { ownerUserId: OWNER })).toThrowError(
        /foto inválida/i
      );
    }
  });

  it("recusa fotos repetidas antes de chegar ao banco", () => {
    const duplicated = [...keysFor(3), `sale-requests/${OWNER}/sess/2026/08/uuid-0.webp`];
    expect(() => validatePhotoKeys(duplicated, { ownerUserId: OWNER })).toThrowError(/repetidas/i);
  });

  it("normaliza a barra inicial antes de conferir o prefixo", () => {
    // `/sale-requests/7/...` é o mesmo objeto; recusá-lo seria falso negativo.
    const leading = keysFor(4).map((key) => `/${key}`);
    expect(validatePhotoKeys(leading, { ownerUserId: OWNER })).toHaveLength(4);
  });
});

describe("paginação", () => {
  it("aplica o default quando ausente ou absurdo", () => {
    for (const raw of [undefined, null, "", "abc", "0", "-5"]) {
      expect(parseLimit(raw)).toBe(SALE_REQUEST_PAGE.DEFAULT_LIMIT);
    }
  });

  it("faz clamp no teto", () => {
    expect(parseLimit(String(SALE_REQUEST_PAGE.MAX_LIMIT + 100))).toBe(
      SALE_REQUEST_PAGE.MAX_LIMIT
    );
  });

  it("faz ida e volta do cursor", () => {
    const row = { created_at: "2026-08-16T12:00:00.000Z", id: 42 };
    const cursor = encodeCursor(row);
    expect(decodeCursor(cursor)).toEqual({ createdAt: row.created_at, id: 42 });
  });

  it("devolve null para cursor inválido em vez de lançar", () => {
    // Um link velho colado da barra de endereços deve voltar à primeira página,
    // não derrubar a listagem.
    for (const raw of ["", "!!!", "bm90LWEtY3Vyc29y", Buffer.from("sem-pipe").toString("base64url")]) {
      expect(decodeCursor(raw)).toBeNull();
    }
  });

  it("devolve null ao codificar linha sem os dois campos", () => {
    expect(encodeCursor({ id: 1 })).toBeNull();
    expect(encodeCursor({ created_at: "2026-08-16T12:00:00.000Z" })).toBeNull();
  });
});

describe("corpo completo", () => {
  const VALID = {
    city_id: 1,
    brand: "VW - VolksWagen",
    fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    year: "2020",
    mileage: "45000",
    transmission: "Automático",
    fuel_type: "Flex",
    declared_condition: "bom",
    known_issues: "Pequeno risco no para-choque.",
    images: keysFor(4),
  };

  it("normaliza tudo para o formato das colunas", () => {
    const result = validateNewSaleRequest(VALID, { ownerUserId: OWNER });

    expect(result).toMatchObject({
      cityId: 1,
      brand: "Volkswagen",
      brandSlug: "volkswagen",
      model: "T-Cross",
      modelSlug: "t-cross",
      fipeModelDescription: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
      year: 2020,
      mileage: 45000,
      declaredCondition: "bom",
    });
    // Câmbio gravado sem acento — o slug canônico, nunca o rótulo.
    expect(result.transmission).toBe(validateTransmission("Automático"));
    expect(result.transmission).not.toMatch(/á/);
    expect(result.photos).toHaveLength(4);
  });

  it("NÃO produz campo de placa em nenhuma circunstância", () => {
    const withPlate = { ...VALID, plate: "ABC1D23", placa: "ABC1D23" };
    const result = validateNewSaleRequest(withPlate, { ownerUserId: OWNER });

    expect(result).not.toHaveProperty("plate");
    expect(result).not.toHaveProperty("placa");
    expect(JSON.stringify(result)).not.toContain("ABC1D23");
  });

  it("ignora valor FIPE enviado pelo cliente", () => {
    // O cliente não é autoridade sobre o valor de mercado do próprio carro.
    const spoofed = {
      ...VALID,
      fipe_reference_value: 999999,
      fipe_price: 999999,
      status: "cancelled",
      owner_user_id: "1",
    };
    const result = validateNewSaleRequest(spoofed, { ownerUserId: OWNER });

    expect(result).not.toHaveProperty("fipeReferenceValue");
    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("ownerUserId");
  });
});
