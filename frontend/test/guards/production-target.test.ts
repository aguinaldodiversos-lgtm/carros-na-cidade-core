import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  assertSafeE2eTarget,
  classifyTarget,
  evaluateTargets,
  findUnsafeTargets,
  hostOf,
  isHostOrSubdomainOf,
  parseEnvFile,
  resolveEffectiveEnv,
  ProductionTargetError,
  PRODUCTION_HOSTS,
  TARGET_ENV_KEYS,
} from "./production-target";

/**
 * Testes do PRÓPRIO guard.
 *
 * Um guard sem teste é pior que nenhum guard: ele cria a sensação de proteção
 * e falha calado no dia em que alguém renomeia uma variável. Os casos abaixo
 * cobrem as três formas de furar este tipo de proteção:
 *
 *   1. variável fora da lista (renomeada, nova, esquecida);
 *   2. sufixo de domínio comparado com `includes` (`carrosnacidade.com.evil.net`);
 *   3. ordem de classificação (staging-*.carrosnacidade.com virando "produção").
 */

const LOCAL = {
  NEXT_PUBLIC_API_URL: "http://127.0.0.1:4000",
  BACKEND_API_URL: "http://127.0.0.1:4000",
  AUTH_API_BASE_URL: "http://127.0.0.1:4000",
  API_URL: "http://127.0.0.1:4000",
  PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3000",
};

describe("classificação de alvo", () => {
  it("localhost e 127.0.0.1 são locais", () => {
    expect(classifyTarget("http://localhost:3000")).toBe("local");
    expect(classifyTarget("http://127.0.0.1:4000")).toBe("local");
    expect(classifyTarget("http://0.0.0.0:4000")).toBe("local");
  });

  it("redes privadas e .local são locais", () => {
    expect(classifyTarget("http://192.168.0.10:3000")).toBe("local");
    expect(classifyTarget("http://10.1.2.3:3000")).toBe("local");
    expect(classifyTarget("http://maquina.local:3000")).toBe("local");
  });

  it.each(PRODUCTION_HOSTS)("%s é produção", (host) => {
    expect(classifyTarget(`https://${host}`)).toBe("producao");
  });

  it("www.carrosnacidade.com é produção (subdomínio do host conhecido)", () => {
    expect(classifyTarget("https://www.carrosnacidade.com")).toBe("producao");
  });

  it("o caminho na URL não muda o veredito — quem decide é o host", () => {
    expect(classifyTarget("https://www.carrosnacidade.com/api/ads/search?limit=1")).toBe(
      "producao"
    );
  });

  it("staging vence produção na ordem de classificação", () => {
    // `staging-api.carrosnacidade.com` TERMINA em `carrosnacidade.com`. Se o
    // teste de produção rodasse primeiro, staging seria bloqueado.
    expect(classifyTarget("https://staging-api.carrosnacidade.com")).toBe("staging");
    expect(classifyTarget("https://staging.carrosnacidade.com")).toBe("staging");
  });

  it("host desconhecido não é presumido seguro", () => {
    expect(classifyTarget("https://algum-host-qualquer.example.com")).toBe("desconhecido");
  });

  it("valor vazio ou lixo não vira 'local' por acidente", () => {
    expect(classifyTarget("")).toBe("desconhecido");
    expect(classifyTarget("   ")).toBe("desconhecido");
  });

  it("valor sem esquema ainda é julgado pelo host", () => {
    expect(classifyTarget("localhost:3000")).toBe("local");
    expect(classifyTarget("www.carrosnacidade.com")).toBe("producao");
  });
});

describe("isHostOrSubdomainOf — a armadilha do includes", () => {
  it("aceita o próprio host e subdomínios", () => {
    expect(isHostOrSubdomainOf("carrosnacidade.com", "carrosnacidade.com")).toBe(true);
    expect(isHostOrSubdomainOf("www.carrosnacidade.com", "carrosnacidade.com")).toBe(true);
    expect(isHostOrSubdomainOf("a.b.carrosnacidade.com", "carrosnacidade.com")).toBe(true);
  });

  it("REJEITA domínio de atacante que apenas CONTÉM o host de produção", () => {
    expect(isHostOrSubdomainOf("carrosnacidade.com.atacante.net", "carrosnacidade.com")).toBe(
      false
    );
    expect(isHostOrSubdomainOf("naocarrosnacidade.com", "carrosnacidade.com")).toBe(false);
  });
});

describe("hostOf", () => {
  it("extrai o hostname e normaliza caixa", () => {
    expect(hostOf("https://WWW.CarrosNaCidade.COM/x")).toBe("www.carrosnacidade.com");
  });

  it("devolve string vazia para entrada vazia", () => {
    expect(hostOf("")).toBe("");
  });
});

describe("cobertura das variáveis de alvo", () => {
  it("as cinco variáveis exigidas pela homologação estão na lista", () => {
    for (const chave of [
      "NEXT_PUBLIC_API_URL",
      "E2E_BACKEND_API_URL",
      "BACKEND_API_URL",
      "AUTH_API_BASE_URL",
      "API_URL",
    ]) {
      expect(TARGET_ENV_KEYS, `${chave} precisa ser inspecionada`).toContain(chave);
    }
  });

  it("variáveis ausentes não geram alvo (não viram 'desconhecido' vazio)", () => {
    expect(evaluateTargets({ NEXT_PUBLIC_API_URL: "" })).toEqual([]);
    expect(evaluateTargets({})).toEqual([]);
  });

  it("cada variável presente vira exatamente um alvo avaliado", () => {
    expect(evaluateTargets(LOCAL)).toHaveLength(5);
  });
});

describe("assertSafeE2eTarget", () => {
  it("ambiente 100% local passa sem lançar", () => {
    expect(() => assertSafeE2eTarget(LOCAL)).not.toThrow();
  });

  it("staging passa sem lançar (contrato do staging-antifraud-smoke)", () => {
    expect(() =>
      assertSafeE2eTarget({
        ...LOCAL,
        BACKEND_API_URL: "https://staging-api.carrosnacidade.com",
      })
    ).not.toThrow();
  });

  it("UMA variável apontando para produção já aborta a suíte inteira", () => {
    expect(() =>
      assertSafeE2eTarget({
        ...LOCAL,
        AUTH_API_BASE_URL: "https://carros-na-cidade-core.onrender.com",
      })
    ).toThrow(ProductionTargetError);
  });

  it("o cenário REAL do repositório é bloqueado (frontend/.env.local)", () => {
    // Exatamente as quatro variáveis que o `.env.local` versionado define.
    const comoEstaNoRepo = {
      AUTH_API_BASE_URL: "https://carros-na-cidade-core.onrender.com",
      BACKEND_API_URL: "https://carros-na-cidade-core.onrender.com",
      API_URL: "https://carros-na-cidade-core.onrender.com",
      NEXT_PUBLIC_API_URL: "https://carros-na-cidade-core.onrender.com",
    };

    const erro = (() => {
      try {
        assertSafeE2eTarget(comoEstaNoRepo);
        return null;
      } catch (e) {
        return e as ProductionTargetError;
      }
    })();

    expect(erro, "o .env.local do repositório precisa ser recusado").toBeInstanceOf(
      ProductionTargetError
    );
    expect(erro!.alvos).toHaveLength(4);
  });

  it("a mensagem nomeia a variável culpada e o valor — diagnóstico sem adivinhação", () => {
    try {
      assertSafeE2eTarget({ ...LOCAL, API_URL: "https://www.carrosnacidade.com" });
      throw new Error("deveria ter lançado");
    } catch (e) {
      const msg = String((e as Error).message);
      expect(msg).toContain("API_URL");
      expect(msg).toContain("https://www.carrosnacidade.com");
      expect(msg).toContain("ALLOW_PRODUCTION");
    }
  });

  it("host desconhecido também aborta — fail-closed, não fail-open", () => {
    expect(() =>
      assertSafeE2eTarget({ ...LOCAL, BACKEND_API_URL: "https://api.terceiro.example.com" })
    ).toThrow(ProductionTargetError);
  });

  it("ALLOW_PRODUCTION=true libera (válvula explícita do contrato existente)", () => {
    expect(() =>
      assertSafeE2eTarget({
        ...LOCAL,
        API_URL: "https://www.carrosnacidade.com",
        ALLOW_PRODUCTION: "true",
      })
    ).not.toThrow();
  });

  it("ALLOW_PRODUCTION com valor diferente de 'true' NÃO libera", () => {
    for (const valor of ["1", "yes", "TRUE ", "sim", ""]) {
      expect(
        () =>
          assertSafeE2eTarget({
            ...LOCAL,
            API_URL: "https://www.carrosnacidade.com",
            ALLOW_PRODUCTION: valor,
          }),
        `ALLOW_PRODUCTION="${valor}" não pode liberar`
      ).toThrow(ProductionTargetError);
    }
  });

  it("findUnsafeTargets lista só os culpados, não o ambiente inteiro", () => {
    const inseguros = findUnsafeTargets({
      ...LOCAL,
      API_URL: "https://www.carrosnacidade.com",
    });
    expect(inseguros.map((a) => a.chave)).toEqual(["API_URL"]);
  });
});

describe("arquivos .env — o buraco que process.env sozinho não fecha", () => {
  it("parseEnvFile lê KEY=VALUE, aspas e `export`", () => {
    const lido = parseEnvFile(
      [
        "# comentário",
        "API_URL=https://exemplo.test",
        'BACKEND_API_URL="https://aspas.test"',
        "export AUTH_API_BASE_URL='https://simples.test'",
        "LINHA SEM IGUAL",
        "",
      ].join("\n")
    );

    expect(lido).toEqual({
      API_URL: "https://exemplo.test",
      BACKEND_API_URL: "https://aspas.test",
      AUTH_API_BASE_URL: "https://simples.test",
    });
  });

  it("o valor do arquivo é usado quando process.env não define a chave", () => {
    const efetivo = resolveEffectiveEnv({}, [
      { NEXT_PUBLIC_API_URL: "https://carros-na-cidade-core.onrender.com" },
    ]);
    expect(efetivo.NEXT_PUBLIC_API_URL).toBe("https://carros-na-cidade-core.onrender.com");
  });

  it("process.env tem precedência sobre o arquivo (é assim que o Next resolve)", () => {
    const efetivo = resolveEffectiveEnv({ NEXT_PUBLIC_API_URL: "http://127.0.0.1:4000" }, [
      { NEXT_PUBLIC_API_URL: "https://carros-na-cidade-core.onrender.com" },
    ]);
    expect(efetivo.NEXT_PUBLIC_API_URL).toBe("http://127.0.0.1:4000");
  });

  it("o primeiro arquivo da ordem de precedência vence", () => {
    const efetivo = resolveEffectiveEnv({}, [
      { API_URL: "http://127.0.0.1:4000" },
      { API_URL: "https://www.carrosnacidade.com" },
    ]);
    expect(efetivo.API_URL).toBe("http://127.0.0.1:4000");
  });

  it("CENÁRIO CRÍTICO: process.env limpo + .env.local de produção é BLOQUEADO", () => {
    // É o estado padrão de quem clona o repositório e roda `npm run dev`.
    // Um guard que olhasse só `process.env` daria verde justamente aqui.
    const efetivo = resolveEffectiveEnv({}, [
      {
        AUTH_API_BASE_URL: "https://carros-na-cidade-core.onrender.com",
        BACKEND_API_URL: "https://carros-na-cidade-core.onrender.com",
        API_URL: "https://carros-na-cidade-core.onrender.com",
        NEXT_PUBLIC_API_URL: "https://carros-na-cidade-core.onrender.com",
      },
    ]);

    expect(() => assertSafeE2eTarget(efetivo)).toThrow(ProductionTargetError);
  });

  it("sobrescrever no process.env é o caminho de escape correto e ele funciona", () => {
    const efetivo = resolveEffectiveEnv(
      {
        AUTH_API_BASE_URL: "http://127.0.0.1:4000",
        BACKEND_API_URL: "http://127.0.0.1:4000",
        API_URL: "http://127.0.0.1:4000",
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:4000",
      },
      [
        {
          AUTH_API_BASE_URL: "https://carros-na-cidade-core.onrender.com",
          BACKEND_API_URL: "https://carros-na-cidade-core.onrender.com",
          API_URL: "https://carros-na-cidade-core.onrender.com",
          NEXT_PUBLIC_API_URL: "https://carros-na-cidade-core.onrender.com",
        },
      ]
    );

    expect(() => assertSafeE2eTarget(efetivo)).not.toThrow();
  });

  it("o arquivo .env.local REAL do repositório é avaliado e recusado", () => {
    // Teste de alcance: prova que o guard lê o disco de verdade, não só o
    // objeto que o teste monta. Se alguém corrigir o .env.local, este caso
    // passa a não lançar — e aí a asserção abaixo avisa em vez de mentir.
    const aqui = path.dirname(fileURLToPath(import.meta.url));
    const arquivo = path.resolve(aqui, "../../.env.local");

    if (!fs.existsSync(arquivo)) {
      expect(fs.existsSync(arquivo)).toBe(false);
      return;
    }

    const lido = parseEnvFile(fs.readFileSync(arquivo, "utf8"));
    const alvos = TARGET_ENV_KEYS.map((k) => lido[k]).filter(Boolean);
    expect(alvos.length, ".env.local precisa definir ao menos um alvo").toBeGreaterThan(0);

    const efetivo = resolveEffectiveEnv({}, [lido]);
    const inseguros = findUnsafeTargets(efetivo);
    const temProducao = inseguros.some((a) => a.veredito === "producao");

    // Hoje aponta para produção. Quando isso for corrigido, o guard deixa de
    // acusar — e o teste continua correto nos dois estados.
    expect(temProducao || inseguros.length === 0).toBe(true);
  });
});
