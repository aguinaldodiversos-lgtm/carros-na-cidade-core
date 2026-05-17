import { describe, expect, it } from "vitest";

import * as pageModule from "./page";

describe("segmento /carros-usados/regiao/[slug] — configuração de redirect", () => {
  it("exporta dynamic = 'force-dynamic'", () => {
    expect(pageModule.dynamic).toBe("force-dynamic");
  });
});
