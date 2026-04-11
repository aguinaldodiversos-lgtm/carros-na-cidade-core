import { describe, it, expect } from "vitest";
import { sanitizeS3MetadataValue } from "./s3-metadata-sanitize";

describe("sanitizeS3MetadataValue", () => {
  it("remove acentos e mantém extensão legível", () => {
    expect(sanitizeS3MetadataValue("veículo frontal.jpg")).toBe("veiculo frontal.jpg");
  });

  it("substitui caracteres não ASCII restantes", () => {
    expect(sanitizeS3MetadataValue("foto\x01\x02")).toMatch(/^foto__/);
  });
});
